package auth_test

import (
	"context"
	"strings"
	"testing"

	auth "go-check-ssl/apps/api/internal/auth"
	"go-check-ssl/apps/api/internal/testutil"
)

func TestRegisterVerifyAndLogin(t *testing.T) {
	runtime := testutil.NewRuntime(t)

	user, err := runtime.Auth.Register(context.Background(), auth.RegisterInput{
		Email:      "owner@example.com",
		Password:   "Password123!",
		TenantName: "Owner workspace",
	})
	if err != nil {
		t.Fatalf("register user: %v", err)
	}

	if len(runtime.Mailer.Messages) != 1 {
		t.Fatalf("expected one verification email, got %d", len(runtime.Mailer.Messages))
	}

	message := runtime.Mailer.Messages[0].Body
	pieces := strings.Split(message, "token=")
	if len(pieces) != 2 {
		t.Fatalf("expected token in email body, got %q", message)
	}
	token := strings.TrimSpace(pieces[1])

	if err := runtime.Auth.VerifyEmail(context.Background(), token); err != nil {
		t.Fatalf("verify email: %v", err)
	}

	loggedIn, tokens, err := runtime.Auth.Login(context.Background(), auth.LoginInput{
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
