package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type SMTPConfig struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
}

type Config struct {
	AppEnv                 string
	AppAddr                string
	AppBaseURL             string
	WebDistDir             string
	DBDriver               string
	DatabaseURL            string
	AllowRegistration      bool
	BootstrapAdminEmail    string
	BootstrapAdminPassword string
	JWTSecret              string
	AccessTokenTTL         time.Duration
	RefreshTokenTTL        time.Duration
	ScanConcurrency        int
	ScanInterval           time.Duration
	ScanTimeout            time.Duration
	WebhookTimeout         time.Duration
	SMTP                   SMTPConfig
	TelegramBotToken       string
}

func Load() (Config, error) {
	cfg := Config{
		AppEnv:                 getString("APP_ENV", "development"),
		AppAddr:                getString("APP_ADDR", ":8080"),
		AppBaseURL:             getString("APP_BASE_URL", "http://localhost:8080"),
		WebDistDir:             getString("WEB_DIST_DIR", ""),
		DBDriver:               strings.ToLower(getString("DB_DRIVER", "sqlite")),
		DatabaseURL:            getString("DATABASE_URL", "data/go-check-ssl.db"),
		AllowRegistration:      getBool("ALLOW_REGISTRATION", true),
		BootstrapAdminEmail:    getString("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com"),
		BootstrapAdminPassword: getString("BOOTSTRAP_ADMIN_PASSWORD", "ChangeMe123!"),
		JWTSecret:              getString("JWT_SECRET", "change-me-in-production"),
		AccessTokenTTL:         getDuration("ACCESS_TOKEN_TTL", 15*time.Minute),
		RefreshTokenTTL:        getDuration("REFRESH_TOKEN_TTL", 30*24*time.Hour),
		ScanConcurrency:        getInt("SCAN_CONCURRENCY", 5),
		ScanInterval:           getDuration("SCAN_INTERVAL", time.Hour),
		ScanTimeout:            getDuration("SCAN_TIMEOUT", 10*time.Second),
		WebhookTimeout:         getDuration("WEBHOOK_TIMEOUT", 5*time.Second),
		TelegramBotToken:       getString("TELEGRAM_BOT_TOKEN", ""),
		SMTP: SMTPConfig{
			Host:     getString("SMTP_HOST", ""),
			Port:     getInt("SMTP_PORT", 587),
			Username: getString("SMTP_USERNAME", ""),
			Password: getString("SMTP_PASSWORD", ""),
			From:     getString("SMTP_FROM", "no-reply@example.com"),
		},
	}

	if cfg.DBDriver != "sqlite" && cfg.DBDriver != "mysql" && cfg.DBDriver != "postgres" && cfg.DBDriver != "postgresql" {
		return Config{}, fmt.Errorf("unsupported DB_DRIVER %q", cfg.DBDriver)
	}
	if cfg.DBDriver == "postgresql" {
		cfg.DBDriver = "postgres"
	}
	if cfg.JWTSecret == "" {
		return Config{}, fmt.Errorf("JWT_SECRET must not be empty")
	}
	if cfg.ScanConcurrency < 1 {
		cfg.ScanConcurrency = 1
	}
	return cfg, nil
}

func (c Config) IsProduction() bool {
	return strings.EqualFold(c.AppEnv, "production")
}

func getString(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func getBool(key string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func getInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func getDuration(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return parsed
}
