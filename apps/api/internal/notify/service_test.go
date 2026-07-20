package notify

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/luodaoyi/Certwarden/apps/api/internal/config"
	"github.com/luodaoyi/Certwarden/apps/api/internal/models"
)

type roundTripperFunc func(*http.Request) (*http.Response, error)

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
