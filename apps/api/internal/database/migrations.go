package database

import (
	"go-check-ssl/apps/api/internal/models"

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
	})
	return migration.Migrate()
}
