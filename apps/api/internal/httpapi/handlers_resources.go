package httpapi

import (
	"context"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/luodaoyi/Certwarden/apps/api/internal/models"
	"github.com/luodaoyi/Certwarden/apps/api/internal/notify"

	"gorm.io/gorm"
)

type domainRequest struct {
	Hostname             string `json:"hostname"`
	Port                 int    `json:"port"`
	TargetIP             string `json:"target_ip"`
	Enabled              *bool  `json:"enabled"`
	CheckIntervalSeconds int    `json:"check_interval_seconds"`
}

type endpointRequest struct {
	Name    string                          `json:"name"`
	Type    models.NotificationEndpointType `json:"type"`
	Enabled *bool                           `json:"enabled"`
	Config  map[string]string               `json:"config"`
}

type policyRequest struct {
	ThresholdDays []int  `json:"threshold_days"`
	EndpointIDs   []uint `json:"endpoint_ids"`
}

func (s *Server) handleListDomains(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	domains, err := s.listDomains(r.Context(), user.TenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"domains": domains})
}

func (s *Server) handleGetDomain(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	domainID, err := parseUintParam(r, "domainID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid domain id")
		return
	}

	domain, err := s.findDomain(r.Context(), user.TenantID, domainID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "domain not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"domain": toAPIDomain(*domain)})
}

func (s *Server) handleCreateDomain(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	s.handleUpsertDomain(w, r, user.TenantID, 0, http.StatusCreated)
}

func (s *Server) handleUpdateDomain(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	domainID, err := parseUintParam(r, "domainID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid domain id")
		return
	}
	s.handleUpsertDomain(w, r, user.TenantID, domainID, http.StatusOK)
}

func (s *Server) handleDeleteDomain(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	domainID, err := parseUintParam(r, "domainID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid domain id")
		return
	}
	if err := s.deleteDomain(r.Context(), user.TenantID, domainID); err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "domain not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleManualCheck(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	domainID, err := parseUintParam(r, "domainID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid domain id")
		return
	}
	domain, err := s.findDomain(r.Context(), user.TenantID, domainID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "domain not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	checked, err := s.scheduler.CheckDomainNow(r.Context(), domain.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"domain": toAPIDomain(*checked)})
}

func (s *Server) handleDomainHistory(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	domainID, err := parseUintParam(r, "domainID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid domain id")
		return
	}
	if _, err := s.findDomain(r.Context(), user.TenantID, domainID); err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "domain not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var history []models.DomainCheckResult
	if err := s.db.WithContext(r.Context()).
		Where("tenant_id = ? AND domain_id = ?", user.TenantID, domainID).
		Order("checked_at desc").
		Limit(50).
		Find(&history).Error; err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	response := make([]APIDomainCheckResult, 0, len(history))
	for _, item := range history {
		response = append(response, toAPIDomainCheckResult(item))
	}
	writeJSON(w, http.StatusOK, map[string]any{"history": response})
}

func (s *Server) handleListEndpoints(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	endpoints, err := s.listEndpoints(r.Context(), user.TenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"endpoints": endpoints})
}

func (s *Server) handleCreateEndpoint(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	s.handleUpsertEndpoint(w, r, user.TenantID, 0, http.StatusCreated)
}

func (s *Server) handleUpdateEndpoint(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	endpointID, err := parseUintParam(r, "endpointID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid endpoint id")
		return
	}
	s.handleUpsertEndpoint(w, r, user.TenantID, endpointID, http.StatusOK)
}

func (s *Server) handleDeleteEndpoint(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	endpointID, err := parseUintParam(r, "endpointID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid endpoint id")
		return
	}
	if err := s.deleteEndpoint(r.Context(), user.TenantID, endpointID); err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "endpoint not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleTestEndpoint(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	endpointID, err := parseUintParam(r, "endpointID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid endpoint id")
		return
	}

	endpoint, err := s.findEndpoint(r.Context(), user.TenantID, endpointID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "endpoint not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := s.notify.TestEndpoint(r.Context(), *endpoint); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":   "sent",
		"endpoint": s.toAPIEndpoint(*endpoint),
	})
}

func (s *Server) handleGetPolicies(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	policies, err := s.notify.GetPolicies(r.Context(), user.TenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, policies)
}

func (s *Server) handleUpsertDefaultPolicy(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	s.handlePolicyUpsert(w, r, user.TenantID, 0)
}

func (s *Server) handleUpsertDomainPolicy(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	domainID, err := parseUintParam(r, "domainID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid domain id")
		return
	}
	if _, err := s.findDomain(r.Context(), user.TenantID, domainID); err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "domain not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.handlePolicyUpsert(w, r, user.TenantID, domainID)
}

func (s *Server) handleUpsertDomain(w http.ResponseWriter, r *http.Request, tenantID, domainID uint, successStatus int) {
	var input domainRequest
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	hostname := normalizeHost(input.Hostname)
	if hostname == "" {
		writeError(w, http.StatusBadRequest, "hostname is required")
		return
	}
	port := input.Port
	if port == 0 {
		port = 443
	}
	if port < 1 || port > 65535 {
		writeError(w, http.StatusBadRequest, "port must be between 1 and 65535")
		return
	}
	targetIP := strings.TrimSpace(input.TargetIP)
	if targetIP != "" {
		parsed := net.ParseIP(targetIP)
		if parsed == nil {
			writeError(w, http.StatusBadRequest, "target ip must be a valid IPv4 or IPv6 address")
			return
		}
		targetIP = parsed.String()
	}
	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}
	interval := input.CheckIntervalSeconds
	if interval <= 0 {
		interval = int(s.cfg.ScanInterval.Seconds())
	}

	var domain models.Domain
	if domainID > 0 {
		existing, err := s.findDomain(r.Context(), tenantID, domainID)
		if err != nil {
			if isNotFound(err) {
				writeError(w, http.StatusNotFound, "domain not found")
				return
			}
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		domain = *existing
	}

	domain.TenantID = tenantID
	domain.Hostname = hostname
	domain.Port = port
	domain.TargetIP = targetIP
	domain.Enabled = enabled
	domain.CheckIntervalSeconds = interval
	if domain.NextCheckAt.IsZero() {
		domain.NextCheckAt = time.Now().UTC()
	}
	if domain.Status == "" {
		domain.Status = models.DomainStatusPending
	}

	if domainID == 0 {
		if err := s.db.WithContext(r.Context()).Create(&domain).Error; err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique") {
				writeError(w, http.StatusConflict, "domain already exists")
				return
			}
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	} else {
		if err := s.db.WithContext(r.Context()).Model(&models.Domain{}).
			Where("id = ? AND tenant_id = ?", domainID, tenantID).
			Updates(map[string]any{
				"hostname":               hostname,
				"port":                   port,
				"target_ip":              targetIP,
				"enabled":                enabled,
				"check_interval_seconds": interval,
				"updated_at":             time.Now().UTC(),
			}).Error; err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if err := s.db.WithContext(r.Context()).First(&domain, domainID).Error; err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	writeJSON(w, successStatus, map[string]any{"domain": toAPIDomain(domain)})
}

func (s *Server) handleUpsertEndpoint(w http.ResponseWriter, r *http.Request, tenantID, endpointID uint, successStatus int) {
	var input endpointRequest
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if strings.TrimSpace(input.Name) == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}

	var endpoint models.NotificationEndpoint
	var existingConfig map[string]string
	var maskedExistingConfig map[string]string
	if endpointID > 0 {
		if err := s.db.WithContext(r.Context()).Where("id = ? AND tenant_id = ?", endpointID, tenantID).First(&endpoint).Error; err != nil {
			if isNotFound(err) {
				writeError(w, http.StatusNotFound, "endpoint not found")
				return
			}
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		existingConfig = models.MustEndpointConfig(endpoint.Config)
		maskedExistingConfig = s.notify.MaskConfig(endpoint)
	}

	input.Config = mergeEndpointConfig(input.Type, input.Config, existingConfig, maskedExistingConfig)
	if err := validateEndpointConfig(input.Type, input.Config); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	configRaw, err := models.SetEndpointConfig(input.Config)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	endpoint.TenantID = tenantID
	endpoint.Name = strings.TrimSpace(input.Name)
	endpoint.Type = input.Type
	endpoint.Enabled = enabled
	endpoint.Config = configRaw

	if endpointID == 0 {
		if err := s.db.WithContext(r.Context()).Create(&endpoint).Error; err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	} else {
		if err := s.db.WithContext(r.Context()).Model(&models.NotificationEndpoint{}).
			Where("id = ? AND tenant_id = ?", endpointID, tenantID).
			Updates(map[string]any{
				"name":       endpoint.Name,
				"type":       endpoint.Type,
				"enabled":    endpoint.Enabled,
				"config":     endpoint.Config,
				"updated_at": time.Now().UTC(),
			}).Error; err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if err := s.db.WithContext(r.Context()).First(&endpoint, endpointID).Error; err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	writeJSON(w, successStatus, map[string]any{"endpoint": s.toAPIEndpoint(endpoint)})
}

func (s *Server) handlePolicyUpsert(w http.ResponseWriter, r *http.Request, tenantID, domainID uint) {
	var input policyRequest
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	policy, err := s.notify.UpsertPolicy(r.Context(), tenantID, domainID, input.ThresholdDays, input.EndpointIDs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if policy == nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
		return
	}
	thresholds, _ := policy.ThresholdDays()
	endpointIDs, _ := policy.EndpointIDs()
	writeJSON(w, http.StatusOK, map[string]any{
		"policy": notify.PolicyView{
			ThresholdDays: thresholds,
			EndpointIDs:   endpointIDs,
		},
	})
}

func (s *Server) listDomains(ctx context.Context, tenantID uint) ([]APIDomain, error) {
	var domains []models.Domain
	if err := s.db.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("hostname asc, port asc, target_ip asc").
		Find(&domains).Error; err != nil {
		return nil, err
	}
	response := make([]APIDomain, 0, len(domains))
	for _, domain := range domains {
		response = append(response, toAPIDomain(domain))
	}
	return response, nil
}

func (s *Server) listEndpoints(ctx context.Context, tenantID uint) ([]APIEndpoint, error) {
	var endpoints []models.NotificationEndpoint
	if err := s.db.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("name asc").
		Find(&endpoints).Error; err != nil {
		return nil, err
	}
	response := make([]APIEndpoint, 0, len(endpoints))
	for _, endpoint := range endpoints {
		response = append(response, s.toAPIEndpoint(endpoint))
	}
	return response, nil
}

func (s *Server) findDomain(ctx context.Context, tenantID, domainID uint) (*models.Domain, error) {
	var domain models.Domain
	if err := s.db.WithContext(ctx).Where("id = ? AND tenant_id = ?", domainID, tenantID).First(&domain).Error; err != nil {
		return nil, err
	}
	return &domain, nil
}

func (s *Server) findEndpoint(ctx context.Context, tenantID, endpointID uint) (*models.NotificationEndpoint, error) {
	var endpoint models.NotificationEndpoint
	if err := s.db.WithContext(ctx).Where("id = ? AND tenant_id = ?", endpointID, tenantID).First(&endpoint).Error; err != nil {
		return nil, err
	}
	return &endpoint, nil
}

func (s *Server) deleteDomain(ctx context.Context, tenantID, domainID uint) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.Where("id = ? AND tenant_id = ?", domainID, tenantID).Delete(&models.Domain{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return tx.Where("tenant_id = ? AND scope_type = ? AND domain_id = ?", tenantID, models.NotificationPolicyScopeDomain, domainID).
			Delete(&models.NotificationPolicy{}).Error
	})
}

func (s *Server) deleteEndpoint(ctx context.Context, tenantID, endpointID uint) error {
	result := s.db.WithContext(ctx).Where("id = ? AND tenant_id = ?", endpointID, tenantID).Delete(&models.NotificationEndpoint{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func validateEndpointConfig(endpointType models.NotificationEndpointType, config map[string]string) error {
	switch endpointType {
	case models.NotificationEndpointEmail:
		if strings.TrimSpace(config["recipient_email"]) == "" {
			return models.ErrInvalidEndpointConfig
		}
	case models.NotificationEndpointTelegram:
		if strings.TrimSpace(config["bot_token"]) == "" || strings.TrimSpace(config["chat_id"]) == "" {
			return models.ErrInvalidEndpointConfig
		}
	case models.NotificationEndpointWebhook:
		if strings.TrimSpace(config["url"]) == "" {
			return models.ErrInvalidEndpointConfig
		}
	default:
		return models.ErrInvalidEndpointConfig
	}
	return nil
}

func mergeEndpointConfig(
	endpointType models.NotificationEndpointType,
	inputConfig map[string]string,
	existingConfig map[string]string,
	maskedExistingConfig map[string]string,
) map[string]string {
	merged := map[string]string{}
	for key, value := range inputConfig {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			merged[key] = trimmed
		}
	}

	if len(existingConfig) == 0 || len(maskedExistingConfig) == 0 {
		return merged
	}

	keysToPreserve := []string{}
	switch endpointType {
	case models.NotificationEndpointEmail:
		keysToPreserve = []string{"recipient_email"}
	case models.NotificationEndpointTelegram:
		keysToPreserve = []string{"bot_token", "chat_id"}
	case models.NotificationEndpointWebhook:
		keysToPreserve = []string{"url"}
	}

	for _, key := range keysToPreserve {
		currentValue := strings.TrimSpace(merged[key])
		maskedValue := strings.TrimSpace(maskedExistingConfig[key])
		if currentValue == "" || (maskedValue != "" && currentValue == maskedValue) {
			if existingValue := strings.TrimSpace(existingConfig[key]); existingValue != "" {
				merged[key] = existingValue
			}
		}
	}

	if endpointType == models.NotificationEndpointWebhook {
		headerName := strings.TrimSpace(merged["auth_header_name"])
		if headerName == "" {
			delete(merged, "auth_header_value")
		} else {
			currentValue := strings.TrimSpace(merged["auth_header_value"])
			maskedValue := strings.TrimSpace(maskedExistingConfig["auth_header_value"])
			if currentValue == "" || (maskedValue != "" && currentValue == maskedValue) {
				if existingHeaderName := strings.TrimSpace(existingConfig["auth_header_name"]); existingHeaderName == headerName {
					if existingValue := strings.TrimSpace(existingConfig["auth_header_value"]); existingValue != "" {
						merged["auth_header_value"] = existingValue
					}
				}
			}
		}
	}

	return merged
}
