package auth

import (
	"context"
	"io"
	"log/slog"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"go-check-ssl/apps/api/internal/config"
	"go-check-ssl/apps/api/internal/database"
	"go-check-ssl/apps/api/internal/mailer"
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
		BootstrapAdminEmail:    "admin@example.com",
		BootstrapAdminPassword: "ChangeMe123!",
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

func TestRegisterVerifyAndLogin(t *testing.T) {
	service, sender := newTestService(t)

	user, err := service.Register(context.Background(), RegisterInput{
		Email:      "owner@example.com",
		Password:   "Password123!",
		TenantName: "Owner workspace",
	})
	if err != nil {
		t.Fatalf("register user: %v", err)
	}

	if len(sender.Messages) != 1 {
		t.Fatalf("expected one verification email, got %d", len(sender.Messages))
	}

	message := sender.Messages[0].Body
	pieces := strings.Split(message, "token=")
	if len(pieces) != 2 {
		t.Fatalf("expected token in email body, got %q", message)
	}
	token := strings.TrimSpace(pieces[1])

	if err := service.VerifyEmail(context.Background(), token); err != nil {
		t.Fatalf("verify email: %v", err)
	}

	loggedIn, tokens, err := service.Login(context.Background(), LoginInput{
		Email:    "owner@example.com",
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
}
