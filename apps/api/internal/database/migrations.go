package database

import (
	"github.com/luodaoyi/Certwarden/apps/api/internal/models"
	"strconv"
	"strings"

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
