package notify

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/luodaoyi/Certwarden/apps/api/internal/config"
	"github.com/luodaoyi/Certwarden/apps/api/internal/mailer"
	"github.com/luodaoyi/Certwarden/apps/api/internal/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type roundTripperFunc func(*http.Request) (*http.Response, error)

type recordingSender struct {
	messages []mailer.Message
}

func (s *recordingSender) Send(_ context.Context, message mailer.Message) error {
	s.messages = append(s.messages, message)
	return nil
}

func (f roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestSendTelegramUsesEndpointBotToken(t *testing.T) {
	service := NewService(nil, config.Config{}, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))

	var requestedURL string
	var requestBody string
	service.httpClient = &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			body, err := io.ReadAll(req.Body)
			if err != nil {
				return nil, err
			}
			requestedURL = req.URL.String()
			requestBody = string(body)
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(`{"ok":true}`)),
				Header:     make(http.Header),
			}, nil
		}),
	}

	configRaw, err := models.SetEndpointConfig(map[string]string{
		"bot_token": "123456:tenant-bot-token",
		"chat_id":   "99887766",
	})
	if err != nil {
		t.Fatalf("encode endpoint config: %v", err)
	}

	err = service.send(context.Background(), models.NotificationEndpoint{
		Type:   models.NotificationEndpointTelegram,
		Config: configRaw,
	}, payload{
		EventType: "threshold_reached",
		Hostname:  "example.com",
		Port:      443,
		Status:    "healthy",
	})
	if err != nil {
		t.Fatalf("send telegram event: %v", err)
	}

	if !strings.Contains(requestedURL, "/bot123456:tenant-bot-token/sendMessage") {
		t.Fatalf("expected request to use endpoint bot token, got %q", requestedURL)
	}
	if !strings.Contains(requestBody, `"chat_id":"99887766"`) {
		t.Fatalf("expected chat id in telegram payload, got %s", requestBody)
	}
}

func TestMaskConfigMasksTelegramBotToken(t *testing.T) {
	service := NewService(nil, config.Config{}, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))

	configRaw, err := models.SetEndpointConfig(map[string]string{
		"bot_token": "123456:tenant-bot-token",
		"chat_id":   "99887766",
	})
	if err != nil {
		t.Fatalf("encode endpoint config: %v", err)
	}

	masked := service.MaskConfig(models.NotificationEndpoint{
		Type:   models.NotificationEndpointTelegram,
		Config: configRaw,
	})

	if masked["bot_token"] == "" || masked["bot_token"] == "123456:tenant-bot-token" {
		t.Fatalf("expected telegram bot token to be masked, got %q", masked["bot_token"])
	}
	if masked["chat_id"] == "" || masked["chat_id"] == "99887766" {
		t.Fatalf("expected telegram chat id to be masked, got %q", masked["chat_id"])
	}
}

func TestSendTelegramUsesConfiguredLanguage(t *testing.T) {
	service := NewService(nil, config.Config{}, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))

	var requestBody struct {
		ChatID string `json:"chat_id"`
		Text   string `json:"text"`
	}
	service.httpClient = &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			if err := json.NewDecoder(req.Body).Decode(&requestBody); err != nil {
				return nil, err
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(`{"ok":true}`)),
				Header:     make(http.Header),
			}, nil
		}),
	}

	configRaw, err := models.SetEndpointConfig(map[string]string{
		"bot_token": "123456:tenant-bot-token",
		"chat_id":   "99887766",
		"language":  LanguageSimplifiedChinese,
	})
	if err != nil {
		t.Fatalf("encode endpoint config: %v", err)
	}

	daysRemaining := 7
	expiresAt := time.Date(2026, time.August, 11, 0, 0, 0, 0, time.UTC)
	err = service.send(context.Background(), models.NotificationEndpoint{
		Type:   models.NotificationEndpointTelegram,
		Config: configRaw,
	}, payload{
		EventType:     EventThreshold,
		ThresholdDays: 7,
		Hostname:      "example.com",
		Port:          443,
		Status:        string(models.DomainStatusHealthy),
		DaysRemaining: &daysRemaining,
		CertExpiresAt: &expiresAt,
	})
	if err != nil {
		t.Fatalf("send telegram event: %v", err)
	}

	for _, expected := range []string{
		"事件: 达到提醒阈值",
		"域名: example.com:443",
		"状态: 正常",
		"剩余天数: 7",
		"证书到期时间: 2026-08-11T00:00:00Z",
		"提醒阈值: 7 天",
	} {
		if !strings.Contains(requestBody.Text, expected) {
			t.Fatalf("expected localized telegram text to contain %q, got %q", expected, requestBody.Text)
		}
	}
}

func TestTelegramTestNotificationUsesConfiguredLanguage(t *testing.T) {
	service := NewService(nil, config.Config{}, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	service.now = func() time.Time {
		return time.Date(2026, time.July, 20, 4, 0, 0, 0, time.UTC)
	}

	var requestBody struct {
		Text string `json:"text"`
	}
	service.httpClient = &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			if err := json.NewDecoder(req.Body).Decode(&requestBody); err != nil {
				return nil, err
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(`{"ok":true}`)),
				Header:     make(http.Header),
			}, nil
		}),
	}

	configRaw, err := models.SetEndpointConfig(map[string]string{
		"bot_token": "123456:tenant-bot-token",
		"chat_id":   "99887766",
		"language":  LanguageTraditionalChinese,
	})
	if err != nil {
		t.Fatalf("encode endpoint config: %v", err)
	}

	err = service.TestEndpoint(context.Background(), models.NotificationEndpoint{
		Name:   "主要電報",
		Type:   models.NotificationEndpointTelegram,
		Config: configRaw,
	})
	if err != nil {
		t.Fatalf("send telegram test notification: %v", err)
	}

	for _, expected := range []string{
		"Certwarden 測試通知",
		"通知端點: 主要電報",
		"類型: telegram",
		"時間: 2026-07-20T04:00:00Z",
	} {
		if !strings.Contains(requestBody.Text, expected) {
			t.Fatalf("expected localized telegram test text to contain %q, got %q", expected, requestBody.Text)
		}
	}
}

func TestSupportedNotificationLanguages(t *testing.T) {
	for _, language := range []string{"", LanguageEnglish, LanguageSimplifiedChinese, LanguageTraditionalChinese} {
		if !IsSupportedLanguage(language) {
			t.Fatalf("expected language %q to be supported", language)
		}
	}
	if IsSupportedLanguage("fr") {
		t.Fatal("expected unsupported language to be rejected")
	}
}

func TestDefaultPolicyDeliversOncePerUTCDayWithinThirtyDays(t *testing.T) {
	db := openNotifyTestDB(t)
	sender := &recordingSender{}
	service := NewService(db, config.Config{WebhookTimeout: time.Second}, sender, slog.New(slog.NewTextHandler(io.Discard, nil)))
	now := time.Date(2026, time.August, 4, 23, 30, 0, 0, time.UTC)
	service.now = func() time.Time { return now }

	configRaw, err := models.SetEndpointConfig(map[string]string{"recipient_email": "ops@example.com"})
	if err != nil {
		t.Fatalf("encode endpoint config: %v", err)
	}
	endpoint := models.NotificationEndpoint{
		TenantID: 1,
		Name:     "Operations",
		Type:     models.NotificationEndpointEmail,
		Enabled:  true,
		Config:   configRaw,
	}
	if err := db.Create(&endpoint).Error; err != nil {
		t.Fatalf("create endpoint: %v", err)
	}

	policy := models.NotificationPolicy{
		TenantID:    1,
		ScopeType:   models.NotificationPolicyScopeTenant,
		RepeatDaily: true,
	}
	if err := policy.SetThresholdDays([]int{30}); err != nil {
		t.Fatalf("set thresholds: %v", err)
	}
	if err := policy.SetEndpointIDs([]uint{endpoint.ID}); err != nil {
		t.Fatalf("set endpoints: %v", err)
	}
	if err := db.Create(&policy).Error; err != nil {
		t.Fatalf("create policy: %v", err)
	}

	daysRemaining := 20
	previousDays := 21
	expiresAt := now.Add(20 * 24 * time.Hour)
	domain := models.Domain{
		ID:            8,
		TenantID:      1,
		Hostname:      "example.com",
		Port:          443,
		Status:        models.DomainStatusHealthy,
		DaysRemaining: &daysRemaining,
		CertExpiresAt: &expiresAt,
	}

	if err := service.MaybeNotify(context.Background(), domain, models.DomainStatusHealthy, &previousDays); err != nil {
		t.Fatalf("first notification: %v", err)
	}
	if err := service.MaybeNotify(context.Background(), domain, models.DomainStatusHealthy, &previousDays); err != nil {
		t.Fatalf("same-day notification: %v", err)
	}
	if len(sender.messages) != 1 {
		t.Fatalf("expected one delivery in the same UTC day, got %d", len(sender.messages))
	}

	now = now.Add(24 * time.Hour)
	if err := service.MaybeNotify(context.Background(), domain, models.DomainStatusHealthy, &previousDays); err != nil {
		t.Fatalf("next-day notification: %v", err)
	}
	if len(sender.messages) != 2 {
		t.Fatalf("expected a second delivery on the next UTC day, got %d", len(sender.messages))
	}

	var deliveries int64
	if err := db.Model(&models.NotificationDelivery{}).Count(&deliveries).Error; err != nil {
		t.Fatalf("count deliveries: %v", err)
	}
	if deliveries != 2 {
		t.Fatalf("expected two persisted deliveries, got %d", deliveries)
	}
}

func TestCustomPolicyKeepsThresholdCrossingBehavior(t *testing.T) {
	previousDays := 20
	currentDays := 19
	domain := models.Domain{Status: models.DomainStatusHealthy, DaysRemaining: &currentDays}
	policy := PolicyView{ThresholdDays: []int{30}, RepeatDaily: false}

	events := computeEvents(models.DomainStatusHealthy, &previousDays, domain, policy, time.Now())
	if len(events) != 0 {
		t.Fatalf("expected no event without a threshold crossing, got %#v", events)
	}
}

func TestDailyReminderDedupKeyChangesAtUTCDateBoundary(t *testing.T) {
	daysRemaining := 20
	expiresAt := time.Date(2026, time.August, 24, 0, 0, 0, 0, time.UTC)
	domain := models.Domain{
		ID:            8,
		Status:        models.DomainStatusHealthy,
		DaysRemaining: &daysRemaining,
		CertExpiresAt: &expiresAt,
	}
	policy := PolicyView{ThresholdDays: []int{30}, RepeatDaily: true}
	endpoint := models.NotificationEndpoint{ID: 1}

	first := computeEvents(models.DomainStatusHealthy, nil, domain, policy, time.Date(2026, time.August, 4, 23, 59, 0, 0, time.UTC))
	second := computeEvents(models.DomainStatusHealthy, nil, domain, policy, time.Date(2026, time.August, 5, 0, 1, 0, 0, time.UTC))
	if len(first) != 1 || len(second) != 1 {
		t.Fatalf("expected one daily event on each UTC date, got %d and %d", len(first), len(second))
	}
	if buildDedupKey(domain, endpoint, first[0]) == buildDedupKey(domain, endpoint, second[0]) {
		t.Fatal("expected UTC dates to produce distinct daily reminder dedup keys")
	}
}

func openNotifyTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		if strings.Contains(err.Error(), "requires cgo") {
			t.Skipf("sqlite driver unavailable in this environment: %v", err)
		}
		t.Fatalf("open sqlite database: %v", err)
	}
	if err := db.AutoMigrate(&models.NotificationEndpoint{}, &models.NotificationPolicy{}, &models.NotificationDelivery{}); err != nil {
		t.Fatalf("migrate notify tables: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("open sql database: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	return db
}
