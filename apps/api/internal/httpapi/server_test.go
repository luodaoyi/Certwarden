package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"go-check-ssl/apps/api/internal/testutil"
)

func TestRegisterVerifyLoginAndAdminList(t *testing.T) {
	runtime := testutil.NewRuntime(t)
	router := runtime.HTTPServer.Router()

	registerBody := map[string]any{
		"email": "owner@example.com",
		"password": "Password123!",
		"tenant_name": "Owner workspace",
	}
	registerResp := performJSONRequest(t, router, http.MethodPost, "/api/auth/register", registerBody, "")
	if registerResp.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", registerResp.Code, registerResp.Body.String())
	}

	if len(runtime.Mailer.Messages) == 0 {
		t.Fatalf("expected verification email to be sent")
	}
	token := strings.TrimSpace(strings.Split(runtime.Mailer.Messages[0].Body, "token=")[1])

	verifyResp := performJSONRequest(t, router, http.MethodPost, "/api/auth/verify-email", map[string]string{"token": token}, "")
	if verifyResp.Code != http.StatusOK {
		t.Fatalf("expected verify 200, got %d (%s)", verifyResp.Code, verifyResp.Body.String())
	}

	loginResp := performJSONRequest(t, router, http.MethodPost, "/api/auth/login", map[string]string{
		"email": "owner@example.com",
		"password": "Password123!",
	}, "")
	if loginResp.Code != http.StatusOK {
		t.Fatalf("expected login 200, got %d (%s)", loginResp.Code, loginResp.Body.String())
	}

	var loginPayload struct {
		Tokens struct {
			AccessToken string `json:"access_token"`
		} `json:"tokens"`
	}
	if err := json.Unmarshal(loginResp.Body.Bytes(), &loginPayload); err != nil {
		t.Fatalf("decode login payload: %v", err)
	}

	createDomainResp := performJSONRequest(t, router, http.MethodPost, "/api/domains", map[string]any{
		"hostname": "example.com",
		"port": 443,
		"enabled": true,
		"check_interval_seconds": 3600,
	}, loginPayload.Tokens.AccessToken)
	if createDomainResp.Code != http.StatusCreated {
		t.Fatalf("expected create domain 201, got %d (%s)", createDomainResp.Code, createDomainResp.Body.String())
	}

	adminLoginResp := performJSONRequest(t, router, http.MethodPost, "/api/auth/login", map[string]string{
		"email": runtime.Config.BootstrapAdminEmail,
		"password": runtime.Config.BootstrapAdminPassword,
	}, "")
	if adminLoginResp.Code != http.StatusOK {
		t.Fatalf("expected admin login 200, got %d (%s)", adminLoginResp.Code, adminLoginResp.Body.String())
	}
	var adminLoginPayload struct {
		Tokens struct {
			AccessToken string `json:"access_token"`
		} `json:"tokens"`
	}
	if err := json.Unmarshal(adminLoginResp.Body.Bytes(), &adminLoginPayload); err != nil {
		t.Fatalf("decode admin login payload: %v", err)
	}

	adminUsersResp := performJSONRequest(t, router, http.MethodGet, "/api/admin/users", nil, adminLoginPayload.Tokens.AccessToken)
	if adminUsersResp.Code != http.StatusOK {
		t.Fatalf("expected admin users 200, got %d (%s)", adminUsersResp.Code, adminUsersResp.Body.String())
	}
}

func performJSONRequest(t *testing.T, handler http.Handler, method, target string, payload any, accessToken string) *httptest.ResponseRecorder {
	t.Helper()

	var body bytes.Buffer
	if payload != nil {
		if err := json.NewEncoder(&body).Encode(payload); err != nil {
			t.Fatalf("encode payload: %v", err)
		}
	}

	req := httptest.NewRequest(method, target, &body)
	req.Header.Set("Content-Type", "application/json")
	if accessToken != "" {
		req.Header.Set("Authorization", "Bearer "+accessToken)
	}

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder
}
