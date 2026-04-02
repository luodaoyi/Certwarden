package database

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"go-check-ssl/apps/api/internal/config"
	"go-check-ssl/apps/api/internal/models"
)

func TestOpenAndMigrateConfiguredDatabase(t *testing.T) {
	driver := os.Getenv("TEST_DATABASE")
	cfg := config.Config{
		DBDriver:     "sqlite",
		DatabaseURL:  filepath.Join(t.TempDir(), "integration.db"),
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
