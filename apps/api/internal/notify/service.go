package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"go-check-ssl/apps/api/internal/config"
	"go-check-ssl/apps/api/internal/mailer"
	"go-check-ssl/apps/api/internal/models"

	"gorm.io/gorm"
)

const (
	EventThreshold = "threshold_reached"
	EventExpired   = "expired"
	EventRecovered = "recovered"
)

type PolicyView struct {
	ThresholdDays []int  `json:"threshold_days"`
	EndpointIDs   []uint `json:"endpoint_ids"`
}

type TenantPolicies struct {
	Default   PolicyView            `json:"default"`
	Overrides map[uint]PolicyView   `json:"overrides"`
}

type Service struct {
	db         *gorm.DB
	cfg        config.Config
	mailer     mailer.Sender
	logger     *slog.Logger
	httpClient *http.Client
	now        func() time.Time
}

type payload struct {
	EventType     string     `json:"event_type"`
	ThresholdDays int        `json:"threshold_days,omitempty"`
	DomainID      uint       `json:"domain_id"`
	Hostname      string     `json:"hostname"`
	Port          int        `json:"port"`
	Status        string     `json:"status"`
	DaysRemaining *int       `json:"days_remaining,omitempty"`
	CertExpiresAt *time.Time `json:"cert_expires_at,omitempty"`
}

type event struct {
	Type          string
	ThresholdDays int
}

func NewService(db *gorm.DB, cfg config.Config, sender mailer.Sender, logger *slog.Logger) *Service {
	return &Service{
		db:         db,
		cfg:        cfg,
		mailer:     sender,
		logger:     logger,
		httpClient: &http.Client{Timeout: cfg.WebhookTimeout},
		now: func() time.Time {
			return time.Now().UTC()
		},
	}
}

func (s *Service) GetPolicies(ctx context.Context, tenantID uint) (*TenantPolicies, error) {
	var policies []models.NotificationPolicy
	if err := s.db.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("scope_type asc, domain_id asc").
		Find(&policies).Error; err != nil {
		return nil, err
	}

	response := &TenantPolicies{
		Default: PolicyView{ThresholdDays: []int{30, 7, 1}, EndpointIDs: []uint{}},
		Overrides: map[uint]PolicyView{},
	}

	for _, policy := range policies {
		thresholds, err := policy.ThresholdDays()
		if err != nil {
			return nil, err
		}
		endpointIDs, err := policy.EndpointIDs()
		if err != nil {
			return nil, err
		}
		view := PolicyView{ThresholdDays: thresholds, EndpointIDs: endpointIDs}
		if policy.ScopeType == models.NotificationPolicyScopeTenant {
			response.Default = view
			continue
		}
		response.Overrides[policy.DomainID] = view
	}

	return response, nil
}

func (s *Service) UpsertPolicy(ctx context.Context, tenantID, domainID uint, thresholdDays []int, endpointIDs []uint) (*models.NotificationPolicy, error) {
	scope := models.NotificationPolicyScopeTenant
	if domainID > 0 {
		scope = models.NotificationPolicyScopeDomain
	}

	thresholdDays = normalizeThresholds(thresholdDays)
	endpointIDs = normalizeEndpointIDs(endpointIDs)

	if domainID > 0 && len(thresholdDays) == 0 && len(endpointIDs) == 0 {
		if err := s.db.WithContext(ctx).Where("tenant_id = ? AND scope_type = ? AND domain_id = ?", tenantID, scope, domainID).Delete(&models.NotificationPolicy{}).Error; err != nil {
			return nil, err
		}
		return nil, nil
	}

	policy := models.NotificationPolicy{
		TenantID:  tenantID,
		ScopeType: scope,
		DomainID:  domainID,
	}
	if err := policy.SetThresholdDays(thresholdDays); err != nil {
		return nil, err
	}
	if err := policy.SetEndpointIDs(endpointIDs); err != nil {
		return nil, err
	}

	if err := s.db.WithContext(ctx).
		Where(models.NotificationPolicy{TenantID: tenantID, ScopeType: scope, DomainID: domainID}).
		Assign(policy).
		FirstOrCreate(&policy).Error; err != nil {
		return nil, err
	}
	return &policy, nil
}

func (s *Service) MaybeNotify(ctx context.Context, domain models.Domain, previousStatus models.DomainStatus, previousDays *int) error {
	if domain.Status != models.DomainStatusHealthy {
		return nil
	}

	policy, endpoints, err := s.resolvePolicy(ctx, domain.TenantID, domain.ID)
	if err != nil {
		return err
	}
	if len(endpoints) == 0 {
		return nil
	}

	events := computeEvents(previousStatus, previousDays, domain, policy.ThresholdDays)
	if len(events) == 0 {
		return nil
	}

	for _, evt := range events {
		for _, endpoint := range endpoints {
			if !endpoint.Enabled {
				continue
			}
			if err := s.deliverEvent(ctx, domain, endpoint, evt); err != nil {
				s.logger.Error("notify delivery failed", "domain_id", domain.ID, "endpoint_id", endpoint.ID, "error", err)
			}
		}
	}

	return nil
}

func (s *Service) MaskConfig(endpoint models.NotificationEndpoint) map[string]string {
	config := models.MustEndpointConfig(endpoint.Config)
	switch endpoint.Type {
	case models.NotificationEndpointEmail:
		config["recipient_email"] = maskEmail(config["recipient_email"])
	case models.NotificationEndpointTelegram:
		config["chat_id"] = maskValue(config["chat_id"])
	case models.NotificationEndpointWebhook:
		if raw := config["url"]; raw != "" {
			parsed, err := url.Parse(raw)
			if err == nil {
				config["url"] = parsed.Scheme + "://" + parsed.Host + "/***"
			} else {
				config["url"] = "***"
			}
		}
		if config["auth_header_value"] != "" {
			config["auth_header_value"] = "***"
		}
	}
	return config
}

func (s *Service) resolvePolicy(ctx context.Context, tenantID, domainID uint) (PolicyView, []models.NotificationEndpoint, error) {
	policies, err := s.GetPolicies(ctx, tenantID)
	if err != nil {
		return PolicyView{}, nil, err
	}

	policy := policies.Default
	if override, ok := policies.Overrides[domainID]; ok {
		policy = override
	}

	if len(policy.EndpointIDs) == 0 {
		return policy, []models.NotificationEndpoint{}, nil
	}

	var endpoints []models.NotificationEndpoint
	if err := s.db.WithContext(ctx).
		Where("tenant_id = ? AND id IN ?", tenantID, policy.EndpointIDs).
		Find(&endpoints).Error; err != nil {
		return PolicyView{}, nil, err
	}

	return policy, endpoints, nil
}

func computeEvents(previousStatus models.DomainStatus, previousDays *int, domain models.Domain, thresholds []int) []event {
	if domain.DaysRemaining == nil {
		return nil
	}

	events := []event{}
	current := *domain.DaysRemaining

	for _, threshold := range computeThresholdCrossings(previousDays, current, thresholds) {
		events = append(events, event{Type: EventThreshold, ThresholdDays: threshold})
	}

	if (previousDays == nil || *previousDays >= 0) && current < 0 {
		events = append(events, event{Type: EventExpired, ThresholdDays: 0})
	}

	if previousStatus == models.DomainStatusError && domain.Status == models.DomainStatusHealthy {
		events = append(events, event{Type: EventRecovered})
	}

	return events
}

func computeThresholdCrossings(previousDays *int, current int, thresholds []int) []int {
	normalized := normalizeThresholds(thresholds)
	if len(normalized) == 0 {
		return nil
	}

	if previousDays == nil {
		for _, threshold := range normalized {
			if current <= threshold {
				return []int{threshold}
			}
		}
		return nil
	}

	events := []int{}
	for _, threshold := range normalized {
		if *previousDays > threshold && current <= threshold {
			events = append(events, threshold)
		}
	}
	return events
}

func (s *Service) deliverEvent(ctx context.Context, domain models.Domain, endpoint models.NotificationEndpoint, evt event) error {
	dedupKey := buildDedupKey(domain, endpoint, evt)
	var existing models.NotificationDelivery
	if err := s.db.WithContext(ctx).Where("dedup_key = ?", dedupKey).First(&existing).Error; err == nil {
		return nil
	} else if err != gorm.ErrRecordNotFound {
		return err
	}

	payloadBody := payload{
		EventType:     evt.Type,
		ThresholdDays: evt.ThresholdDays,
		DomainID:      domain.ID,
		Hostname:      domain.Hostname,
		Port:          domain.Port,
		Status:        string(domain.Status),
		DaysRemaining: domain.DaysRemaining,
		CertExpiresAt: domain.CertExpiresAt,
	}
	encodedPayload, _ := json.Marshal(payloadBody)

	delivery := models.NotificationDelivery{
		TenantID:      domain.TenantID,
		DomainID:      domain.ID,
		EndpointID:    endpoint.ID,
		EventType:     evt.Type,
		ThresholdDays: evt.ThresholdDays,
		DedupKey:      dedupKey,
		Status:        "pending",
		Payload:       string(encodedPayload),
		CertExpiresAt: domain.CertExpiresAt,
	}
	if err := s.db.WithContext(ctx).Create(&delivery).Error; err != nil {
		return err
	}

	err := s.send(ctx, endpoint, payloadBody)
	now := s.now()
	updates := map[string]any{
		"updated_at": now,
	}
	if err != nil {
		updates["status"] = "failed"
		updates["error_message"] = err.Error()
	} else {
		updates["status"] = "sent"
		updates["sent_at"] = now
		updates["error_message"] = ""
	}
	if updateErr := s.db.WithContext(ctx).Model(&models.NotificationDelivery{}).Where("id = ?", delivery.ID).Updates(updates).Error; updateErr != nil {
		return updateErr
	}
	return err
}

func (s *Service) send(ctx context.Context, endpoint models.NotificationEndpoint, body payload) error {
	config := models.MustEndpointConfig(endpoint.Config)
	message := formatMessage(body)

	switch endpoint.Type {
	case models.NotificationEndpointEmail:
		recipient := strings.TrimSpace(config["recipient_email"])
		if recipient == "" {
			return models.ErrInvalidEndpointConfig
		}
		return s.mailer.Send(ctx, mailer.Message{
			To:      recipient,
			Subject: fmt.Sprintf("[go-check-ssl] %s %s", body.EventType, body.Hostname),
			Body:    message,
		})
	case models.NotificationEndpointTelegram:
		if strings.TrimSpace(s.cfg.TelegramBotToken) == "" {
			return fmt.Errorf("telegram bot token is not configured")
		}
		chatID := strings.TrimSpace(config["chat_id"])
		if chatID == "" {
			return models.ErrInvalidEndpointConfig
		}
		payload := map[string]string{
			"chat_id": chatID,
			"text":    message,
		}
		return s.postJSON(ctx, fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", s.cfg.TelegramBotToken), payload, nil)
	case models.NotificationEndpointWebhook:
		targetURL := strings.TrimSpace(config["url"])
		if targetURL == "" {
			return models.ErrInvalidEndpointConfig
		}
		headers := map[string]string{}
		if headerName := strings.TrimSpace(config["auth_header_name"]); headerName != "" {
			headers[headerName] = config["auth_header_value"]
		}
		return s.postJSON(ctx, targetURL, body, headers)
	default:
		return fmt.Errorf("unsupported endpoint type %s", endpoint.Type)
	}
}

func (s *Service) postJSON(ctx context.Context, targetURL string, body any, headers map[string]string) error {
	encoded, err := json.Marshal(body)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(encoded))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("unexpected response status %s", resp.Status)
	}
	return nil
}

func formatMessage(body payload) string {
	parts := []string{
		fmt.Sprintf("Event: %s", body.EventType),
		fmt.Sprintf("Domain: %s:%d", body.Hostname, body.Port),
		fmt.Sprintf("Status: %s", body.Status),
	}
	if body.DaysRemaining != nil {
		parts = append(parts, fmt.Sprintf("Days remaining: %d", *body.DaysRemaining))
	}
	if body.CertExpiresAt != nil {
		parts = append(parts, fmt.Sprintf("Certificate expires at: %s", body.CertExpiresAt.Format(time.RFC3339)))
	}
	if body.ThresholdDays > 0 {
		parts = append(parts, fmt.Sprintf("Threshold: %d days", body.ThresholdDays))
	}
	return strings.Join(parts, "\n")
}

func normalizeThresholds(values []int) []int {
	if len(values) == 0 {
		return []int{}
	}
	cloned := make([]int, 0, len(values))
	seen := map[int]struct{}{}
	for _, value := range values {
		if value < 0 {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		cloned = append(cloned, value)
	}
	slices.Sort(cloned)
	return cloned
}

func normalizeEndpointIDs(values []uint) []uint {
	if len(values) == 0 {
		return []uint{}
	}
	cloned := make([]uint, 0, len(values))
	seen := map[uint]struct{}{}
	for _, value := range values {
		if value == 0 {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		cloned = append(cloned, value)
	}
	slices.Sort(cloned)
	return cloned
}

func buildDedupKey(domain models.Domain, endpoint models.NotificationEndpoint, evt event) string {
	expiresAt := "none"
	if domain.CertExpiresAt != nil {
		expiresAt = domain.CertExpiresAt.UTC().Format(time.RFC3339)
	}
	return fmt.Sprintf("%d:%d:%s:%d:%s", domain.ID, endpoint.ID, evt.Type, evt.ThresholdDays, expiresAt)
}

func maskEmail(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) != 2 || len(parts[0]) <= 2 {
		return "***"
	}
	return parts[0][:2] + "***@" + parts[1]
}

func maskValue(value string) string {
	if len(value) <= 4 {
		return "***"
	}
	return value[:2] + "***" + value[len(value)-2:]
}
