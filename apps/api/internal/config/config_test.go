package config

import (
	"strings"
	"testing"
	"time"
)

func TestLoadRejectsNonPositiveScanInterval(t *testing.T) {
	for _, value := range []string{"0s", "-1s"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("DB_DRIVER", "sqlite")
			t.Setenv("JWT_SECRET", "test-secret")
			t.Setenv("SCAN_INTERVAL", value)

			_, err := Load()
			if err == nil || !strings.Contains(err.Error(), "SCAN_INTERVAL must be greater than zero") {
				t.Fatalf("expected scan interval validation error, got %v", err)
			}
		})
	}
}

func TestLoadAcceptsPositiveScanInterval(t *testing.T) {
	t.Setenv("DB_DRIVER", "sqlite")
	t.Setenv("JWT_SECRET", "test-secret")
	t.Setenv("SCAN_INTERVAL", "30m")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.ScanInterval != 30*time.Minute {
		t.Fatalf("expected 30m scan interval, got %s", cfg.ScanInterval)
	}
}
