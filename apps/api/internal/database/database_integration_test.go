package database

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/luodaoyi/Certwarden/apps/api/internal/config"
	"github.com/luodaoyi/Certwarden/apps/api/internal/models"
)

func TestOpenAndMigrateConfiguredDatabase(t *testing.T) {
	driver := os.Getenv("TEST_DATABASE")
	cfg := config.Config{
		DBDriver:          "sqlite",
		DatabaseURL:       filepath.Join(t.TempDir(), "integration.db"),
		AllowRegistration: true,
	}

	switch driver {
	case "", "sqlite":
		cfg.DBDriver = "sqlite"
	case "mysql":
		cfg.DBDriver = "mysql"
		cfg.DatabaseURL = os.Getenv("TEST_MYSQL_DSN")
	case "postgres":
		cfg.DBDriver = "postgres"
		cfg.DatabaseURL = os.Getenv("TEST_POSTGRES_DSN")
	default:
		t.Fatalf("unsupported TEST_DATABASE %q", driver)
	}

	db, err := Open(cfg)
	if err != nil {
		if strings.Contains(err.Error(), "requires cgo") {
			t.Skipf("sqlite driver unavailable in this environment: %v", err)
		}
		t.Fatalf("open database: %v", err)
	}
	if err := Migrate(db); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	tenant := models.Tenant{
		Name: fmt.Sprintf("tenant-%d", time.Now().UnixNano()),
		Slug: fmt.Sprintf("tenant-%d", time.Now().UnixNano()),
	}
	if err := db.Create(&tenant).Error; err != nil {
		t.Fatalf("create tenant: %v", err)
	}
	if tenant.ID == 0 {
		t.Fatalf("expected tenant id to be assigned")
	}
}

func TestMigrationEnablesDailyRemindersOnlyForLegacyDefaultPolicy(t *testing.T) {
	cfg := config.Config{
		DBDriver:    "sqlite",
		DatabaseURL: filepath.Join(t.TempDir(), "legacy.db"),
	}
	db, err := Open(cfg)
	if err != nil {
		if strings.Contains(err.Error(), "requires cgo") {
			t.Skipf("sqlite driver unavailable in this environment: %v", err)
		}
		t.Fatalf("open database: %v", err)
	}
	if err := db.AutoMigrate(&models.NotificationPolicy{}); err != nil {
		t.Fatalf("create legacy policy table: %v", err)
	}

	legacyDefault := models.NotificationPolicy{
		TenantID:  1,
		ScopeType: models.NotificationPolicyScopeTenant,
	}
	if err := legacyDefault.SetThresholdDays([]int{30, 7, 1}); err != nil {
		t.Fatalf("set legacy thresholds: %v", err)
	}
	if err := legacyDefault.SetEndpointIDs([]uint{1}); err != nil {
		t.Fatalf("set legacy endpoints: %v", err)
	}
	if err := db.Create(&legacyDefault).Error; err != nil {
		t.Fatalf("create legacy default policy: %v", err)
	}

	customDefault := models.NotificationPolicy{
		TenantID:  2,
		ScopeType: models.NotificationPolicyScopeTenant,
	}
	if err := customDefault.SetThresholdDays([]int{15}); err != nil {
		t.Fatalf("set custom thresholds: %v", err)
	}
	if err := customDefault.SetEndpointIDs([]uint{2}); err != nil {
		t.Fatalf("set custom endpoints: %v", err)
	}
	if err := db.Create(&customDefault).Error; err != nil {
		t.Fatalf("create custom default policy: %v", err)
	}

	if err := Migrate(db); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	if err := db.First(&legacyDefault, legacyDefault.ID).Error; err != nil {
		t.Fatalf("reload legacy default: %v", err)
	}
	legacyThresholds, err := legacyDefault.ThresholdDays()
	if err != nil {
		t.Fatalf("decode migrated thresholds: %v", err)
	}
	if !legacyDefault.RepeatDaily || len(legacyThresholds) != 3 || legacyThresholds[0] != 1 || legacyThresholds[1] != 7 || legacyThresholds[2] != 30 {
		t.Fatalf("expected migrated daily 30-day policy, got repeat=%t thresholds=%v", legacyDefault.RepeatDaily, legacyThresholds)
	}

	if err := db.First(&customDefault, customDefault.ID).Error; err != nil {
		t.Fatalf("reload custom default: %v", err)
	}
	customThresholds, err := customDefault.ThresholdDays()
	if err != nil {
		t.Fatalf("decode custom thresholds: %v", err)
	}
	if customDefault.RepeatDaily || len(customThresholds) != 1 || customThresholds[0] != 15 {
		t.Fatalf("expected custom policy to remain unchanged, got repeat=%t thresholds=%v", customDefault.RepeatDaily, customThresholds)
	}
}

func TestEnsureBootstrapDoesNotOverwriteExistingDefaultPolicy(t *testing.T) {
	cfg := config.Config{
		DBDriver:               "sqlite",
		DatabaseURL:            filepath.Join(t.TempDir(), "bootstrap.db"),
		AllowRegistration:      true,
		BootstrapAdminUsername: "bootstrap-admin",
		BootstrapAdminPassword: "Password123!",
	}
	db, err := Open(cfg)
	if err != nil {
		if strings.Contains(err.Error(), "requires cgo") {
			t.Skipf("sqlite driver unavailable in this environment: %v", err)
		}
		t.Fatalf("open database: %v", err)
	}
	if err := Migrate(db); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	tenant := models.Tenant{Name: "Platform Admin", Slug: "platform-admin"}
	if err := db.Create(&tenant).Error; err != nil {
		t.Fatalf("create bootstrap tenant: %v", err)
	}
	policy := models.NotificationPolicy{
		TenantID:  tenant.ID,
		ScopeType: models.NotificationPolicyScopeTenant,
	}
	if err := policy.SetThresholdDays([]int{15}); err != nil {
		t.Fatalf("set custom thresholds: %v", err)
	}
	if err := policy.SetEndpointIDs([]uint{42}); err != nil {
		t.Fatalf("set custom endpoints: %v", err)
	}
	if err := db.Create(&policy).Error; err != nil {
		t.Fatalf("create custom policy: %v", err)
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	if err := EnsureBootstrap(context.Background(), db, cfg, logger); err != nil {
		t.Fatalf("ensure bootstrap: %v", err)
	}

	if err := db.First(&policy, policy.ID).Error; err != nil {
		t.Fatalf("reload custom policy: %v", err)
	}
	thresholds, err := policy.ThresholdDays()
	if err != nil {
		t.Fatalf("decode custom thresholds: %v", err)
	}
	endpointIDs, err := policy.EndpointIDs()
	if err != nil {
		t.Fatalf("decode custom endpoints: %v", err)
	}
	if policy.RepeatDaily || len(thresholds) != 1 || thresholds[0] != 15 || len(endpointIDs) != 1 || endpointIDs[0] != 42 {
		t.Fatalf("expected bootstrap to preserve custom policy, got repeat=%t thresholds=%v endpoints=%v", policy.RepeatDaily, thresholds, endpointIDs)
	}
}
