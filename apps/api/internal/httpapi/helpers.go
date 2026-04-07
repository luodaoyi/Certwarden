package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/luodaoyi/Certwarden/apps/api/internal/auth"
	"github.com/luodaoyi/Certwarden/apps/api/internal/models"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type contextKey string

const userContextKey contextKey = "auth-user"

type AuthUser struct {
	ID       uint
	TenantID uint
	Role     models.UserRole
	Username string
}

type APIUser struct {
	ID            uint            `json:"id"`
	TenantID      uint            `json:"tenant_id"`
	Username      string          `json:"username"`
	Email         string          `json:"email,omitempty"`
	Role          models.UserRole `json:"role"`
	EmailVerified bool            `json:"email_verified"`
	LastLoginAt   *time.Time      `json:"last_login_at,omitempty"`
}

type APIDomain struct {
	ID                   uint                `json:"id"`
	Hostname             string              `json:"hostname"`
	Port                 int                 `json:"port"`
	Enabled              bool                `json:"enabled"`
	Status               models.DomainStatus `json:"status"`
	CertExpiresAt        *time.Time          `json:"cert_expires_at,omitempty"`
	DaysRemaining        *int                `json:"days_remaining,omitempty"`
	LastError            string              `json:"last_error,omitempty"`
	LastCheckedAt        *time.Time          `json:"last_checked_at,omitempty"`
	LastSuccessfulAt     *time.Time          `json:"last_successful_at,omitempty"`
	NextCheckAt          time.Time           `json:"next_check_at"`
	CheckIntervalSeconds int                 `json:"check_interval_seconds"`
	CreatedAt            time.Time           `json:"created_at"`
	UpdatedAt            time.Time           `json:"updated_at"`
}

type APIEndpoint struct {
	ID           uint                            `json:"id"`
	Name         string                          `json:"name"`
	Type         models.NotificationEndpointType `json:"type"`
	Enabled      bool                            `json:"enabled"`
	ConfigMasked map[string]string               `json:"config_masked"`
	CreatedAt    time.Time                       `json:"created_at"`
	UpdatedAt    time.Time                       `json:"updated_at"`
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if payload == nil {
		return
	}
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func decodeJSON(r *http.Request, dest any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	return decoder.Decode(dest)
}

func currentUser(ctx context.Context) (AuthUser, bool) {
	user, ok := ctx.Value(userContextKey).(AuthUser)
	return user, ok
}

func withUser(ctx context.Context, user AuthUser) context.Context {
	return context.WithValue(ctx, userContextKey, user)
}

func parseUintParam(r *http.Request, name string) (uint, error) {
	value := chi.URLParam(r, name)
	parsed, err := strconv.ParseUint(value, 10, 64)
	return uint(parsed), err
}

func toAPIUser(user models.User) APIUser {
	email := ""
	if user.ContactEmail != nil {
		email = *user.ContactEmail
	}

	return APIUser{
		ID:            user.ID,
		TenantID:      user.TenantID,
		Username:      user.Username,
		Email:         email,
		Role:          user.Role,
		EmailVerified: email != "" && user.EmailVerifiedAt != nil,
		LastLoginAt:   user.LastLoginAt,
	}
}

func toAPIDomain(domain models.Domain) APIDomain {
	return APIDomain{
		ID:                   domain.ID,
		Hostname:             domain.Hostname,
		Port:                 domain.Port,
		Enabled:              domain.Enabled,
		Status:               domain.Status,
		CertExpiresAt:        domain.CertExpiresAt,
		DaysRemaining:        domain.DaysRemaining,
		LastError:            domain.LastError,
		LastCheckedAt:        domain.LastCheckedAt,
		LastSuccessfulAt:     domain.LastSuccessfulAt,
		NextCheckAt:          domain.NextCheckAt,
		CheckIntervalSeconds: domain.CheckIntervalSeconds,
		CreatedAt:            domain.CreatedAt,
		UpdatedAt:            domain.UpdatedAt,
	}
}

func (s *Server) toAPIEndpoint(endpoint models.NotificationEndpoint) APIEndpoint {
	return APIEndpoint{
		ID:           endpoint.ID,
		Name:         endpoint.Name,
		Type:         endpoint.Type,
		Enabled:      endpoint.Enabled,
		ConfigMasked: s.notify.MaskConfig(endpoint),
		CreatedAt:    endpoint.CreatedAt,
		UpdatedAt:    endpoint.UpdatedAt,
	}
}

func authStatus(err error) (int, string) {
	switch {
	case errors.Is(err, auth.ErrRegistrationDisabled):
		return http.StatusForbidden, err.Error()
	case errors.Is(err, auth.ErrInvalidCredentials):
		return http.StatusUnauthorized, err.Error()
	case errors.Is(err, auth.ErrEmailNotVerified):
		return http.StatusForbidden, err.Error()
	case errors.Is(err, auth.ErrInvalidToken), errors.Is(err, auth.ErrTokenExpired):
		return http.StatusUnauthorized, err.Error()
	case errors.Is(err, auth.ErrConflict):
		return http.StatusConflict, err.Error()
	default:
		return http.StatusBadRequest, err.Error()
	}
}

func normalizeHost(host string) string {
	host = strings.TrimSpace(strings.ToLower(host))
	host = strings.TrimPrefix(host, "https://")
	host = strings.TrimPrefix(host, "http://")
	host = strings.Trim(host, "/")
	return host
}

func isNotFound(err error) bool {
	return errors.Is(err, gorm.ErrRecordNotFound)
}
