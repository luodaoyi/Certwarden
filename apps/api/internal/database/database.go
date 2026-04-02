package database

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"go-check-ssl/apps/api/internal/config"
	"go-check-ssl/apps/api/internal/models"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

const registrationSettingKey = "allow_registration"

func Open(cfg config.Config) (*gorm.DB, error) {
	var dialector gorm.Dialector

	switch cfg.DBDriver {
	case "sqlite":
		if err := os.MkdirAll(filepath.Dir(cfg.DatabaseURL), 0o755); err != nil && filepath.Dir(cfg.DatabaseURL) != "." {
			return nil, fmt.Errorf("create sqlite directory: %w", err)
		}
		dialector = sqlite.Open(cfg.DatabaseURL)
	case "mysql":
		dialector = mysql.Open(cfg.DatabaseURL)
	case "postgres":
		dialector = postgres.Open(cfg.DatabaseURL)
	default:
		return nil, fmt.Errorf("unsupported driver %q", cfg.DBDriver)
	}

	db, err := gorm.Open(dialector, &gorm.Config{
		NowFunc: func() time.Time {
			return time.Now().UTC()
		},
	})
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if cfg.DBDriver == "sqlite" {
		if err := db.Exec("PRAGMA foreign_keys = ON").Error; err != nil {
			return nil, fmt.Errorf("enable sqlite foreign keys: %w", err)
		}
	}

	return db, nil
}

func Migrate(db *gorm.DB) error {
	return runMigrations(db)
}

func EnsureBootstrap(ctx context.Context, db *gorm.DB, cfg config.Config, logger *slog.Logger) error {
	now := time.Now().UTC()

	if err := upsertSystemSetting(ctx, db, registrationSettingKey, fmt.Sprintf("%t", cfg.AllowRegistration)); err != nil {
		return err
	}

	if strings.TrimSpace(cfg.BootstrapAdminEmail) == "" || strings.TrimSpace(cfg.BootstrapAdminPassword) == "" {
		return nil
	}

	var existing models.User
	err := db.WithContext(ctx).Where("email = ?", strings.ToLower(strings.TrimSpace(cfg.BootstrapAdminEmail))).First(&existing).Error
	if err == nil {
		return nil
	}
	if err != nil && err != gorm.ErrRecordNotFound {
		return err
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(cfg.BootstrapAdminPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash bootstrap password: %w", err)
	}

	tenant := models.Tenant{
		Name: "Platform Admin",
		Slug: "platform-admin",
	}

	if err := db.WithContext(ctx).Where(models.Tenant{Slug: tenant.Slug}).FirstOrCreate(&tenant).Error; err != nil {
		return fmt.Errorf("bootstrap tenant: %w", err)
	}

	admin := models.User{
		TenantID:        tenant.ID,
		Email:           strings.ToLower(strings.TrimSpace(cfg.BootstrapAdminEmail)),
		PasswordHash:    string(passwordHash),
		Role:            models.RoleSuperAdmin,
		EmailVerifiedAt: &now,
	}

	if err := db.WithContext(ctx).Create(&admin).Error; err != nil {
		return fmt.Errorf("bootstrap admin: %w", err)
	}

	policy := models.NotificationPolicy{
		TenantID:  tenant.ID,
		ScopeType: models.NotificationPolicyScopeTenant,
		DomainID:  0,
	}
	_ = policy.SetThresholdDays([]int{30, 7, 1})
	_ = policy.SetEndpointIDs([]uint{})

	if err := db.WithContext(ctx).Where(models.NotificationPolicy{
		TenantID:  tenant.ID,
		ScopeType: models.NotificationPolicyScopeTenant,
		DomainID:  0,
	}).Assign(policy).FirstOrCreate(&policy).Error; err != nil {
		return fmt.Errorf("bootstrap policy: %w", err)
	}

	logger.Info("bootstrap admin ensured", "email", admin.Email)
	return nil
}

func GetRegistrationEnabled(ctx context.Context, db *gorm.DB, fallback bool) (bool, error) {
	var setting models.SystemSetting
	err := db.WithContext(ctx).Where("key = ?", registrationSettingKey).First(&setting).Error
	if err == gorm.ErrRecordNotFound {
		return fallback, nil
	}
	if err != nil {
		return false, err
	}
	return strings.EqualFold(setting.Value, "true"), nil
}

func SetRegistrationEnabled(ctx context.Context, db *gorm.DB, enabled bool) error {
	return upsertSystemSetting(ctx, db, registrationSettingKey, fmt.Sprintf("%t", enabled))
}

func upsertSystemSetting(ctx context.Context, db *gorm.DB, key, value string) error {
	setting := models.SystemSetting{Key: key}
	return db.WithContext(ctx).Where(models.SystemSetting{Key: key}).Assign(models.SystemSetting{
		Key:   key,
		Value: value,
	}).FirstOrCreate(&setting).Error
}
