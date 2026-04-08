package httpapi_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/luodaoyi/Certwarden/apps/api/internal/models"
	"github.com/luodaoyi/Certwarden/apps/api/internal/testutil"
)

func TestSessionCookieAndPublicTenantStatus(t *testing.T) {
	runtime := testutil.NewRuntime(t)
	router := runtime.HTTPServer.Router()

	registerResp := performJSONRequest(t, router, http.MethodPost, "/api/auth/register", map[string]any{
		"username": "owner",
		"password": "Password123!",
	}, "")
	if registerResp.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", registerResp.Code, registerResp.Body.String())
	}

	loginResp := performJSONRequest(t, router, http.MethodPost, "/api/auth/login", map[string]string{
		"username": "owner",
		"password": "Password123!",
	}, "")
	if loginResp.Code != http.StatusOK {
		t.Fatalf("expected login 200, got %d (%s)", loginResp.Code, loginResp.Body.String())
	}

	cookieHeader := loginResp.Header().Get("Set-Cookie")
	if cookieHeader == "" {
		t.Fatalf("expected refresh cookie to be set")
	}
	if strings.Contains(strings.ToLower(cookieHeader), "secure") {
		t.Fatalf("expected non-secure cookie for http app base url, got %q", cookieHeader)
	}

	var loginPayload struct {
		User struct {
			TenantID uint `json:"tenant_id"`
		} `json:"user"`
		Tokens struct {
			AccessToken string `json:"access_token"`
		} `json:"tokens"`
	}
	if err := json.Unmarshal(loginResp.Body.Bytes(), &loginPayload); err != nil {
		t.Fatalf("decode login payload: %v", err)
	}

	createDomainResp := performJSONRequest(t, router, http.MethodPost, "/api/domains", map[string]any{
		"hostname":               "example.com",
		"port":                   443,
		"enabled":                true,
		"check_interval_seconds": 86400,
	}, loginPayload.Tokens.AccessToken)
	if createDomainResp.Code != http.StatusCreated {
		t.Fatalf("expected create domain 201, got %d (%s)", createDomainResp.Code, createDomainResp.Body.String())
	}

	updateProfileResp := performJSONRequest(t, router, http.MethodPut, "/api/auth/me", map[string]any{
		"username":               "owner",
		"email":                  "owner@example.com",
		"public_status_title":    "Operations SSL Board",
		"public_status_subtitle": "Track certificate health and expiry windows.",
	}, loginPayload.Tokens.AccessToken)
	if updateProfileResp.Code != http.StatusOK {
		t.Fatalf("expected update profile 200, got %d (%s)", updateProfileResp.Code, updateProfileResp.Body.String())
	}

	publicStatusResp := performJSONRequest(t, router, http.MethodGet, fmt.Sprintf("/api/public/tenants/%d/status", loginPayload.User.TenantID), nil, "")
	if publicStatusResp.Code != http.StatusOK {
		t.Fatalf("expected public status 200, got %d (%s)", publicStatusResp.Code, publicStatusResp.Body.String())
	}

	var publicPayload struct {
		Tenant struct {
			ID                   uint   `json:"id"`
			PublicStatusTitle    string `json:"public_status_title"`
			PublicStatusSubtitle string `json:"public_status_subtitle"`
		} `json:"tenant"`
		Summary struct {
			DomainCount int `json:"domain_count"`
		} `json:"summary"`
		PublicURL string `json:"public_url"`
	}
	if err := json.Unmarshal(publicStatusResp.Body.Bytes(), &publicPayload); err != nil {
		t.Fatalf("decode public status payload: %v", err)
	}
	if publicPayload.Tenant.ID != loginPayload.User.TenantID {
		t.Fatalf("expected tenant id %d, got %d", loginPayload.User.TenantID, publicPayload.Tenant.ID)
	}
	if publicPayload.Summary.DomainCount != 1 {
		t.Fatalf("expected one public domain, got %d", publicPayload.Summary.DomainCount)
	}
	if publicPayload.Tenant.PublicStatusTitle != "Operations SSL Board" {
		t.Fatalf("expected public status title to be returned, got %q", publicPayload.Tenant.PublicStatusTitle)
	}
	if publicPayload.Tenant.PublicStatusSubtitle != "Track certificate health and expiry windows." {
		t.Fatalf("expected public status subtitle to be returned, got %q", publicPayload.Tenant.PublicStatusSubtitle)
	}
	if !strings.Contains(publicPayload.PublicURL, fmt.Sprintf("/status/%d", loginPayload.User.TenantID)) {
		t.Fatalf("expected public status url to include tenant id, got %q", publicPayload.PublicURL)
	}
}

func TestAdminCanDisableTenantAndRotatePassword(t *testing.T) {
	runtime := testutil.NewRuntime(t)
	router := runtime.HTTPServer.Router()

	registerResp := performJSONRequest(t, router, http.MethodPost, "/api/auth/register", map[string]any{
		"username": "owner",
		"password": "Password123!",
	}, "")
	if registerResp.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", registerResp.Code, registerResp.Body.String())
	}

	var registerPayload struct {
		User struct {
			TenantID uint `json:"tenant_id"`
		} `json:"user"`
	}
	if err := json.Unmarshal(registerResp.Body.Bytes(), &registerPayload); err != nil {
		t.Fatalf("decode register payload: %v", err)
	}

	adminLoginResp := performJSONRequest(t, router, http.MethodPost, "/api/auth/login", map[string]string{
		"username": runtime.Config.BootstrapAdminUsername,
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

	tenantsResp := performJSONRequest(t, router, http.MethodGet, "/api/admin/tenants", nil, adminLoginPayload.Tokens.AccessToken)
	if tenantsResp.Code != http.StatusOK {
		t.Fatalf("expected tenants 200, got %d (%s)", tenantsResp.Code, tenantsResp.Body.String())
	}

	var tenantsPayload struct {
		Tenants []struct {
			Tenant struct {
				ID uint `json:"id"`
			} `json:"tenant"`
		} `json:"tenants"`
		Pagination struct {
			Page       int   `json:"page"`
			PageSize   int   `json:"page_size"`
			Total      int64 `json:"total"`
			TotalPages int   `json:"total_pages"`
		} `json:"pagination"`
	}
	if err := json.Unmarshal(tenantsResp.Body.Bytes(), &tenantsPayload); err != nil {
		t.Fatalf("decode tenants payload: %v", err)
	}
	if tenantsPayload.Pagination.Page != 1 || tenantsPayload.Pagination.PageSize != 10 {
		t.Fatalf("unexpected pagination payload: %+v", tenantsPayload.Pagination)
	}
	if tenantsPayload.Pagination.Total < 1 || tenantsPayload.Pagination.TotalPages < 1 {
		t.Fatalf("expected tenant pagination metadata to be populated, got %+v", tenantsPayload.Pagination)
	}

	disableResp := performJSONRequest(t, router, http.MethodPut, fmt.Sprintf("/api/admin/tenants/%d/status", registerPayload.User.TenantID), map[string]bool{
		"disabled": true,
	}, adminLoginPayload.Tokens.AccessToken)
	if disableResp.Code != http.StatusOK {
		t.Fatalf("expected disable 200, got %d (%s)", disableResp.Code, disableResp.Body.String())
	}

	disabledLoginResp := performJSONRequest(t, router, http.MethodPost, "/api/auth/login", map[string]string{
		"username": "owner",
		"password": "Password123!",
	}, "")
	if disabledLoginResp.Code != http.StatusForbidden {
		t.Fatalf("expected disabled login 403, got %d (%s)", disabledLoginResp.Code, disabledLoginResp.Body.String())
	}

	passwordResp := performJSONRequest(t, router, http.MethodPut, fmt.Sprintf("/api/admin/tenants/%d/password", registerPayload.User.TenantID), map[string]string{
		"password": "NewPassword123!",
	}, adminLoginPayload.Tokens.AccessToken)
	if passwordResp.Code != http.StatusOK {
		t.Fatalf("expected password update 200, got %d (%s)", passwordResp.Code, passwordResp.Body.String())
	}

	enableResp := performJSONRequest(t, router, http.MethodPut, fmt.Sprintf("/api/admin/tenants/%d/status", registerPayload.User.TenantID), map[string]bool{
		"disabled": false,
	}, adminLoginPayload.Tokens.AccessToken)
	if enableResp.Code != http.StatusOK {
		t.Fatalf("expected enable 200, got %d (%s)", enableResp.Code, enableResp.Body.String())
	}

	oldPasswordResp := performJSONRequest(t, router, http.MethodPost, "/api/auth/login", map[string]string{
		"username": "owner",
		"password": "Password123!",
	}, "")
	if oldPasswordResp.Code != http.StatusUnauthorized {
		t.Fatalf("expected old password login 401, got %d (%s)", oldPasswordResp.Code, oldPasswordResp.Body.String())
	}

	newPasswordResp := performJSONRequest(t, router, http.MethodPost, "/api/auth/login", map[string]string{
		"username": "owner",
		"password": "NewPassword123!",
	}, "")
	if newPasswordResp.Code != http.StatusOK {
		t.Fatalf("expected new password login 200, got %d (%s)", newPasswordResp.Code, newPasswordResp.Body.String())
	}

	detailResp := performJSONRequest(t, router, http.MethodGet, fmt.Sprintf("/api/admin/tenants/%d", registerPayload.User.TenantID), nil, adminLoginPayload.Tokens.AccessToken)
	if detailResp.Code != http.StatusOK {
		t.Fatalf("expected tenant detail 200, got %d (%s)", detailResp.Code, detailResp.Body.String())
	}

	if registerPayload.User.TenantID == 0 {
		t.Fatalf("expected registered tenant id to be set")
	}
}

func TestAdminTenantListSupportsPaginationAndQuickFilters(t *testing.T) {
	runtime := testutil.NewRuntime(t)
	router := runtime.HTTPServer.Router()

	registerTenant := func(username string) uint {
		t.Helper()

		registerResp := performJSONRequest(t, router, http.MethodPost, "/api/auth/register", map[string]any{
			"username": username,
			"password": "Password123!",
		}, "")
		if registerResp.Code != http.StatusCreated {
			t.Fatalf("expected register 201 for %s, got %d (%s)", username, registerResp.Code, registerResp.Body.String())
		}

		var payload struct {
			User struct {
				TenantID uint `json:"tenant_id"`
			} `json:"user"`
			Tokens struct {
				AccessToken string `json:"access_token"`
			} `json:"tokens"`
		}
		if err := json.Unmarshal(registerResp.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode register payload: %v", err)
		}

		return payload.User.TenantID
	}

	login := func(username string) string {
		t.Helper()
		loginResp := performJSONRequest(t, router, http.MethodPost, "/api/auth/login", map[string]string{
			"username": username,
			"password": "Password123!",
		}, "")
		if loginResp.Code != http.StatusOK {
			t.Fatalf("expected login 200 for %s, got %d (%s)", username, loginResp.Code, loginResp.Body.String())
		}
		var payload struct {
			Tokens struct {
				AccessToken string `json:"access_token"`
			} `json:"tokens"`
		}
		if err := json.Unmarshal(loginResp.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode login payload: %v", err)
		}
		return payload.Tokens.AccessToken
	}

	createDomain := func(accessToken, hostname string) {
		t.Helper()
		resp := performJSONRequest(t, router, http.MethodPost, "/api/domains", map[string]any{
			"hostname":               hostname,
			"port":                   443,
			"enabled":                true,
			"check_interval_seconds": 86400,
		}, accessToken)
		if resp.Code != http.StatusCreated {
			t.Fatalf("expected create domain 201, got %d (%s)", resp.Code, resp.Body.String())
		}
	}

	alphaTenantID := registerTenant("alpha")
	betaTenantID := registerTenant("beta")
	registerTenant("gamma")

	createDomain(login("alpha"), "alpha.example.com")
	createDomain(login("beta"), "beta.example.com")

	now := time.Now().UTC()
	if err := runtime.DB.Model(&models.Domain{}).
		Where("tenant_id = ?", alphaTenantID).
		Updates(map[string]any{
			"status":          models.DomainStatusHealthy,
			"cert_expires_at": now.Add(48 * time.Hour),
		}).Error; err != nil {
		t.Fatalf("seed alpha domain status: %v", err)
	}
	if err := runtime.DB.Model(&models.Domain{}).
		Where("tenant_id = ?", betaTenantID).
		Updates(map[string]any{
			"status":     models.DomainStatusError,
			"last_error": "dial tcp timeout",
		}).Error; err != nil {
		t.Fatalf("seed beta domain status: %v", err)
	}

	adminLoginResp := performJSONRequest(t, router, http.MethodPost, "/api/auth/login", map[string]string{
		"username": runtime.Config.BootstrapAdminUsername,
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

	listResp := performJSONRequest(t, router, http.MethodGet, "/api/admin/tenants?page=1&page_size=2&sort_by=name&sort_order=asc", nil, adminLoginPayload.Tokens.AccessToken)
	if listResp.Code != http.StatusOK {
		t.Fatalf("expected paginated tenants 200, got %d (%s)", listResp.Code, listResp.Body.String())
	}

	var listPayload struct {
		Tenants []struct {
			Owner struct {
				Username string `json:"username"`
			} `json:"owner"`
		} `json:"tenants"`
		Pagination struct {
			Page       int   `json:"page"`
			PageSize   int   `json:"page_size"`
			Total      int64 `json:"total"`
			TotalPages int   `json:"total_pages"`
		} `json:"pagination"`
	}
	if err := json.Unmarshal(listResp.Body.Bytes(), &listPayload); err != nil {
		t.Fatalf("decode paginated tenants payload: %v", err)
	}
	if len(listPayload.Tenants) != 2 {
		t.Fatalf("expected 2 tenants on the first page, got %d", len(listPayload.Tenants))
	}
	if listPayload.Pagination.Total != 3 || listPayload.Pagination.TotalPages != 2 {
		t.Fatalf("unexpected pagination summary: %+v", listPayload.Pagination)
	}

	filterResp := performJSONRequest(t, router, http.MethodGet, "/api/admin/tenants?quick_filter=has_errors&sort_by=errors&sort_order=desc", nil, adminLoginPayload.Tokens.AccessToken)
	if filterResp.Code != http.StatusOK {
		t.Fatalf("expected filtered tenants 200, got %d (%s)", filterResp.Code, filterResp.Body.String())
	}
	var filterPayload struct {
		Tenants []struct {
			Owner struct {
				Username string `json:"username"`
			} `json:"owner"`
			Stats struct {
				ErrorCount int `json:"error_count"`
			} `json:"stats"`
		} `json:"tenants"`
		Pagination struct {
			Total int64 `json:"total"`
		} `json:"pagination"`
	}
	if err := json.Unmarshal(filterResp.Body.Bytes(), &filterPayload); err != nil {
		t.Fatalf("decode filtered tenant payload: %v", err)
	}
	if filterPayload.Pagination.Total != 1 || len(filterPayload.Tenants) != 1 {
		t.Fatalf("expected exactly one tenant with errors, got total=%d len=%d", filterPayload.Pagination.Total, len(filterPayload.Tenants))
	}
	if filterPayload.Tenants[0].Owner.Username != "beta" || filterPayload.Tenants[0].Stats.ErrorCount != 1 {
		t.Fatalf("expected beta tenant with one error, got %+v", filterPayload.Tenants[0])
	}
}

func TestTelegramEndpointRequiresBotTokenAndChatID(t *testing.T) {
	runtime := testutil.NewRuntime(t)
	router := runtime.HTTPServer.Router()

	registerResp := performJSONRequest(t, router, http.MethodPost, "/api/auth/register", map[string]any{
		"username": "owner",
		"password": "Password123!",
	}, "")
	if registerResp.Code != http.StatusCreated {
		t.Fatalf("expected register 201, got %d (%s)", registerResp.Code, registerResp.Body.String())
	}

	loginResp := performJSONRequest(t, router, http.MethodPost, "/api/auth/login", map[string]string{
		"username": "owner",
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

	invalidResp := performJSONRequest(t, router, http.MethodPost, "/api/notification-endpoints", map[string]any{
		"name":    "Tenant Telegram",
		"type":    "telegram",
		"enabled": true,
		"config": map[string]string{
			"chat_id": "99887766",
		},
	}, loginPayload.Tokens.AccessToken)
	if invalidResp.Code != http.StatusBadRequest {
		t.Fatalf("expected telegram endpoint without bot token to fail with 400, got %d (%s)", invalidResp.Code, invalidResp.Body.String())
	}

	validResp := performJSONRequest(t, router, http.MethodPost, "/api/notification-endpoints", map[string]any{
		"name":    "Tenant Telegram",
		"type":    "telegram",
		"enabled": true,
		"config": map[string]string{
			"bot_token": "123456:tenant-bot-token",
			"chat_id":   "99887766",
		},
	}, loginPayload.Tokens.AccessToken)
	if validResp.Code != http.StatusCreated {
		t.Fatalf("expected telegram endpoint with bot token and chat id to succeed, got %d (%s)", validResp.Code, validResp.Body.String())
	}
}

func TestEndpointListReturnsEditableConfigAndCanSendTest(t *testing.T) {
	runtime := testutil.NewRuntime(t)
	router := runtime.HTTPServer.Router()

	registerResp := performJSONRequest(t, router, http.MethodPost, "/api/auth/register", map[string]any{
		"username": "owner",
		"password": "Password123!",
	}, "")
	if registerResp.Code != http.StatusCreated {
		t.Fatalf("expected register 201, got %d (%s)", registerResp.Code, registerResp.Body.String())
	}

	loginResp := performJSONRequest(t, router, http.MethodPost, "/api/auth/login", map[string]string{
		"username": "owner",
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

	requestBodies := make([]string, 0, 1)
	webhook := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		requestBodies = append(requestBodies, string(body))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer webhook.Close()

	createResp := performJSONRequest(t, router, http.MethodPost, "/api/notification-endpoints", map[string]any{
		"name":    "Webhook Test",
		"type":    "webhook",
		"enabled": true,
		"config": map[string]string{
			"url": webhook.URL,
		},
	}, loginPayload.Tokens.AccessToken)
	if createResp.Code != http.StatusCreated {
		t.Fatalf("expected webhook endpoint create 201, got %d (%s)", createResp.Code, createResp.Body.String())
	}
	var createPayload struct {
		Endpoint struct {
			ID int `json:"id"`
		} `json:"endpoint"`
	}
	if err := json.Unmarshal(createResp.Body.Bytes(), &createPayload); err != nil {
		t.Fatalf("decode create payload: %v", err)
	}

	listResp := performJSONRequest(t, router, http.MethodGet, "/api/notification-endpoints", nil, loginPayload.Tokens.AccessToken)
	if listResp.Code != http.StatusOK {
		t.Fatalf("expected endpoint list 200, got %d (%s)", listResp.Code, listResp.Body.String())
	}
	var listPayload struct {
		Endpoints []struct {
			Config map[string]string `json:"config"`
		} `json:"endpoints"`
	}
	if err := json.Unmarshal(listResp.Body.Bytes(), &listPayload); err != nil {
		t.Fatalf("decode list payload: %v", err)
	}
	if len(listPayload.Endpoints) != 1 || listPayload.Endpoints[0].Config["url"] != webhook.URL {
		t.Fatalf("expected editable config to include webhook url, got %+v", listPayload.Endpoints)
	}

	testResp := performJSONRequest(t, router, http.MethodPost, fmt.Sprintf("/api/notification-endpoints/%d/test", createPayload.Endpoint.ID), nil, loginPayload.Tokens.AccessToken)
	if testResp.Code != http.StatusOK {
		t.Fatalf("expected endpoint test 200, got %d (%s)", testResp.Code, testResp.Body.String())
	}
	if len(requestBodies) != 1 || !strings.Contains(requestBodies[0], `"event_type":"test"`) {
		t.Fatalf("expected webhook test payload to be delivered, got %#v", requestBodies)
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
