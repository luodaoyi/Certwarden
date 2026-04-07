package database

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/luodaoyi/Certwarden/apps/api/internal/config"
	"github.com/luodaoyi/Certwarden/apps/api/internal/models"
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

	if strings.TrimSpace(cfg.BootstrapAdminPassword) == "" {
		return nil
	}

	adminUsername := strings.TrimSpace(cfg.BootstrapAdminUsername)
	if adminUsername == "" {
		adminUsername = deriveBootstrapUsername(cfg.BootstrapAdminEmail)
	}
	adminUsernameNormalized := normalizeUsername(adminUsername)
	if adminUsernameNormalized == "" {
		adminUsername = "admin"
		adminUsernameNormalized = "admin"
	}

	var existing models.User
	err := db.WithContext(ctx).Where("username_normalized = ?", adminUsernameNormalized).First(&existing).Error
	if err == nil {
		if existing.Role != models.RoleSuperAdmin {
			return fmt.Errorf("bootstrap username %q already exists and is not a super admin", adminUsername)
		}

		updates := map[string]any{}
		if strings.TrimSpace(cfg.BootstrapAdminEmail) != "" {
			contactEmail, contactEmailNormalized := optionalNormalizedEmail(cfg.BootstrapAdminEmail)
			updates["contact_email"] = contactEmail
			updates["contact_email_normalized"] = contactEmailNormalized
			updates["email_verified_at"] = now
		}
		if len(updates) > 0 {
			if err := db.WithContext(ctx).Model(&models.User{}).Where("id = ?", existing.ID).Updates(updates).Error; err != nil {
				return fmt.Errorf("update bootstrap admin: %w", err)
			}
		}
		return nil
	}
	if err != nil && err != gorm.ErrRecordNotFound {
		return err
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(cfg.BootstrapAdminPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash bootstrap password: %w", err)
	}

	internalEmail, err := generateInternalEmail()
	if err != nil {
		return fmt.Errorf("generate bootstrap internal email: %w", err)
	}

	if normalized := strings.ToLower(strings.TrimSpace(cfg.BootstrapAdminEmail)); normalized != "" {
		internalEmail = normalized
	}

	contactEmail, contactEmailNormalized := optionalNormalizedEmail(cfg.BootstrapAdminEmail)

	tenant := models.Tenant{
		Name: "Platform Admin",
		Slug: "platform-admin",
	}

	if err := db.WithContext(ctx).Where(models.Tenant{Slug: tenant.Slug}).FirstOrCreate(&tenant).Error; err != nil {
		return fmt.Errorf("bootstrap tenant: %w", err)
	}

	admin := models.User{
		TenantID:               tenant.ID,
		Username:               adminUsername,
		UsernameNormalized:     adminUsernameNormalized,
		Email:                  internalEmail,
		ContactEmail:           contactEmail,
		ContactEmailNormalized: contactEmailNormalized,
		PasswordHash:           string(passwordHash),
		Role:                   models.RoleSuperAdmin,
	}
	if contactEmail != nil {
		admin.EmailVerifiedAt = &now
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

	logger.Info("bootstrap admin ensured", "username", admin.Username, "email", cfg.BootstrapAdminEmail)
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

var invalidBootstrapUsername = regexp.MustCompile(`[^\p{L}\p{N}._-]+`)

func deriveBootstrapUsername(email string) string {
	trimmed := strings.TrimSpace(email)
	if trimmed == "" {
		return "admin"
	}
	parts := strings.Split(trimmed, "@")
	if len(parts) > 0 && strings.TrimSpace(parts[0]) != "" {
		return sanitizeUsername(parts[0])
	}
	return "admin"
}

func sanitizeUsername(value string) string {
	sanitized := invalidBootstrapUsername.ReplaceAllString(strings.TrimSpace(value), "-")
	sanitized = strings.Trim(sanitized, "-._")
	if sanitized == "" {
		return "user"
	}
	if utf8.RuneCountInString(sanitized) > 32 {
		runes := []rune(sanitized)
		sanitized = string(runes[:32])
	}
	return sanitized
}

func normalizeUsername(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func optionalNormalizedEmail(value string) (*string, *string) {
	normalized := strings.ToLower(strings.TrimSpace(value))
	if normalized == "" {
		return nil, nil
	}
	contact := normalized
	return &contact, &contact
}

func generateInternalEmail() (string, error) {
	buffer := make([]byte, 8)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return fmt.Sprintf("user-%s@local.invalid", hex.EncodeToString(buffer)), nil
}
