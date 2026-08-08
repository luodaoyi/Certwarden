package database

import (
	"strconv"
	"strings"
	"time"

	"github.com/luodaoyi/Certwarden/apps/api/internal/models"

	"github.com/go-gormigrate/gormigrate/v2"
	"gorm.io/gorm"
)

func runMigrations(db *gorm.DB) error {
	migration := gormigrate.New(db, gormigrate.DefaultOptions, []*gormigrate.Migration{
		{
			ID: "202604020001_initial_schema",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(
					&models.Tenant{},
					&models.User{},
					&models.AuthSession{},
					&models.EmailVerificationToken{},
					&models.PasswordResetToken{},
					&models.Domain{},
					&models.DomainCheckResult{},
					&models.NotificationEndpoint{},
					&models.NotificationPolicy{},
					&models.NotificationDelivery{},
					&models.SystemSetting{},
				)
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable(
					&models.SystemSetting{},
					&models.NotificationDelivery{},
					&models.NotificationPolicy{},
					&models.NotificationEndpoint{},
					&models.DomainCheckResult{},
					&models.Domain{},
					&models.PasswordResetToken{},
					&models.EmailVerificationToken{},
					&models.AuthSession{},
					&models.User{},
					&models.Tenant{},
				)
			},
		},
		{
			ID: "202604070001_usernames_and_contact_email",
			Migrate: func(tx *gorm.DB) error {
				if err := tx.AutoMigrate(&models.User{}); err != nil {
					return err
				}
				return backfillUserAccountFields(tx)
			},
			Rollback: func(tx *gorm.DB) error {
				return nil
			},
		},
		{
			ID: "202604070002_domain_target_ip_and_cert_metadata",
			Migrate: func(tx *gorm.DB) error {
				if err := tx.AutoMigrate(&models.Domain{}, &models.DomainCheckResult{}); err != nil {
					return err
				}
				if tx.Migrator().HasIndex(&models.Domain{}, "idx_domain_host_port_tenant") {
					if err := tx.Migrator().DropIndex(&models.Domain{}, "idx_domain_host_port_tenant"); err != nil {
						return err
					}
				}
				return tx.Migrator().CreateIndex(&models.Domain{}, "idx_domain_host_port_tenant")
			},
			Rollback: func(tx *gorm.DB) error {
				return nil
			},
		},
		{
			ID: "202604070003_tenant_disable_flag",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(&models.Tenant{})
			},
			Rollback: func(tx *gorm.DB) error {
				return nil
			},
		},
		{
			ID: "202604080001_tenant_public_status_presentation",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(&models.Tenant{})
			},
			Rollback: func(tx *gorm.DB) error {
				return nil
			},
		},
		{
			ID: "202608040001_daily_default_notifications",
			Migrate: func(tx *gorm.DB) error {
				if err := tx.AutoMigrate(&models.NotificationPolicy{}); err != nil {
					return err
				}
				return tx.Model(&models.NotificationPolicy{}).
					Where("scope_type = ? AND domain_id = ? AND thresholds_json = ? AND repeat_daily = ?", models.NotificationPolicyScopeTenant, 0, "[1,7,30]", false).
					Update("repeat_daily", true).Error
			},
			Rollback: func(tx *gorm.DB) error {
				return nil
			},
		},
		{
			ID: "202608080001_ssl_check_retry_and_two_hour_default",
			Migrate: func(tx *gorm.DB) error {
				if err := tx.AutoMigrate(&models.Domain{}); err != nil {
					return err
				}
				// 86400 was the old UI default. Re-check those domains immediately
				// and move them to the new two-hour default cadence.
				return tx.Model(&models.Domain{}).
					Where("check_interval_seconds = ?", 24*60*60).
					Updates(map[string]any{
						"check_interval_seconds": 2 * 60 * 60,
						"next_check_at":          time.Now().UTC(),
					}).Error
			},
			Rollback: func(tx *gorm.DB) error {
				return nil
			},
		},
	})
	return migration.Migrate()
}

func backfillUserAccountFields(tx *gorm.DB) error {
	var users []models.User
	if err := tx.Order("id asc").Find(&users).Error; err != nil {
		return err
	}

	for _, user := range users {
		updates := map[string]any{}

		if strings.TrimSpace(user.Username) == "" || strings.TrimSpace(user.UsernameNormalized) == "" {
			username, usernameNormalized, err := nextAvailableLegacyUsername(tx, user.ID, user.Email)
			if err != nil {
				return err
			}
			updates["username"] = username
			updates["username_normalized"] = usernameNormalized
		}

		if user.ContactEmail == nil && !strings.HasSuffix(strings.ToLower(strings.TrimSpace(user.Email)), "@local.invalid") {
			contactEmail, contactEmailNormalized := optionalNormalizedEmail(user.Email)
			updates["contact_email"] = contactEmail
			updates["contact_email_normalized"] = contactEmailNormalized
		} else if user.ContactEmail != nil && user.ContactEmailNormalized == nil {
			_, contactEmailNormalized := optionalNormalizedEmail(*user.ContactEmail)
			updates["contact_email_normalized"] = contactEmailNormalized
		}

		if len(updates) == 0 {
			continue
		}

		if err := tx.Model(&models.User{}).Where("id = ?", user.ID).Updates(updates).Error; err != nil {
			return err
		}
	}

	return nil
}

func nextAvailableLegacyUsername(tx *gorm.DB, userID uint, email string) (string, string, error) {
	base := deriveBootstrapUsername(email)
	candidate := base
	index := 2

	for {
		normalized := normalizeUsername(candidate)

		var count int64
		if err := tx.Model(&models.User{}).
			Where("id <> ? AND username_normalized = ?", userID, normalized).
			Count(&count).Error; err != nil {
			return "", "", err
		}
		if count == 0 {
			return candidate, normalized, nil
		}

		candidate = base + "-" + strconv.Itoa(index)
		index++
	}
}
