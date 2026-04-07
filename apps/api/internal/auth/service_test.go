package auth

import (
	"context"
	"io"
	"log/slog"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/luodaoyi/Certwarden/apps/api/internal/config"
	"github.com/luodaoyi/Certwarden/apps/api/internal/database"
	"github.com/luodaoyi/Certwarden/apps/api/internal/mailer"
)

func newTestService(t *testing.T) (*Service, *mailer.MemorySender) {
	t.Helper()

	cfg := config.Config{
		AppEnv:                 "test",
		AppAddr:                ":0",
		AppBaseURL:             "http://localhost:8080",
		DBDriver:               "sqlite",
		DatabaseURL:            filepath.Join(t.TempDir(), "test.db"),
		AllowRegistration:      true,
		BootstrapAdminUsername: "admin",
		BootstrapAdminEmail:    "admin@example.com",
		BootstrapAdminPassword: "admin",
		JWTSecret:              "unit-test-secret",
		AccessTokenTTL:         15 * time.Minute,
		RefreshTokenTTL:        24 * time.Hour,
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, &slog.HandlerOptions{}))
	db, err := database.Open(cfg)
	if err != nil {
		if strings.Contains(err.Error(), "requires cgo") {
			t.Skipf("sqlite driver unavailable in this environment: %v", err)
		}
		t.Fatalf("open database: %v", err)
	}

	if err := database.Migrate(db); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	if err := database.EnsureBootstrap(context.Background(), db, cfg, logger); err != nil {
		t.Fatalf("bootstrap database: %v", err)
	}

	sender := &mailer.MemorySender{}
	return NewService(db, cfg, sender, logger), sender
}

func TestRegisterUpdateProfileAndLogin(t *testing.T) {
	service, sender := newTestService(t)

	user, err := service.Register(context.Background(), RegisterInput{
		Username:   "owner",
		Password:   "Password123!",
		TenantName: "Owner workspace",
	})
	if err != nil {
		t.Fatalf("register user: %v", err)
	}

	if len(sender.Messages) != 0 {
		t.Fatalf("expected no registration email, got %d", len(sender.Messages))
	}

	updated, err := service.UpdateProfile(context.Background(), user.ID, UpdateProfileInput{
		Username: "owner",
		Email:    "owner@example.com",
	})
	if err != nil {
		t.Fatalf("update profile: %v", err)
	}
	if updated.ContactEmail == nil || *updated.ContactEmail != "owner@example.com" {
		t.Fatalf("expected contact email to be saved, got %+v", updated.ContactEmail)
	}

	loggedIn, tokens, err := service.Login(context.Background(), LoginInput{
		Username: "owner",
		Password: "Password123!",
	})
	if err != nil {
		t.Fatalf("login user: %v", err)
	}

	if loggedIn.ID != user.ID {
		t.Fatalf("expected logged in user %d, got %d", user.ID, loggedIn.ID)
	}
	if tokens.AccessToken == "" || tokens.RefreshToken == "" {
		t.Fatalf("expected tokens to be issued")
	}

	if err := service.ForgotPassword(context.Background(), "owner"); err != nil {
		t.Fatalf("forgot password: %v", err)
	}
	if len(sender.Messages) != 1 {
		t.Fatalf("expected one reset email, got %d", len(sender.Messages))
	}
	if !strings.Contains(sender.Messages[0].Body, "reset-password?token=") {
		t.Fatalf("expected reset token in email body, got %q", sender.Messages[0].Body)
	}
}
