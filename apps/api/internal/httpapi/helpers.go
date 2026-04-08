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

type APITenant struct {
	ID                   uint      `json:"id"`
	Name                 string    `json:"name"`
	Slug                 string    `json:"slug"`
	PublicStatusTitle    string    `json:"public_status_title,omitempty"`
	PublicStatusSubtitle string    `json:"public_status_subtitle,omitempty"`
	Disabled             bool      `json:"disabled"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
}

type APIDomain struct {
	ID                     uint                `json:"id"`
	Hostname               string              `json:"hostname"`
	Port                   int                 `json:"port"`
	TargetIP               string              `json:"target_ip,omitempty"`
	Enabled                bool                `json:"enabled"`
	Status                 models.DomainStatus `json:"status"`
	ResolvedIP             string              `json:"resolved_ip,omitempty"`
	CertValidFrom          *time.Time          `json:"cert_valid_from,omitempty"`
	CertExpiresAt          *time.Time          `json:"cert_expires_at,omitempty"`
	DaysRemaining          *int                `json:"days_remaining,omitempty"`
	CertIssuer             string              `json:"cert_issuer,omitempty"`
	CertSubject            string              `json:"cert_subject,omitempty"`
	CertCommonName         string              `json:"cert_common_name,omitempty"`
	CertDNSNames           []string            `json:"cert_dns_names,omitempty"`
	CertSerialNumber       string              `json:"cert_serial_number,omitempty"`
	CertFingerprintSHA256  string              `json:"cert_fingerprint_sha256,omitempty"`
	CertSignatureAlgorithm string              `json:"cert_signature_algorithm,omitempty"`
	LastError              string              `json:"last_error,omitempty"`
	LastCheckedAt          *time.Time          `json:"last_checked_at,omitempty"`
	LastSuccessfulAt       *time.Time          `json:"last_successful_at,omitempty"`
	NextCheckAt            time.Time           `json:"next_check_at"`
	CheckIntervalSeconds   int                 `json:"check_interval_seconds"`
	CreatedAt              time.Time           `json:"created_at"`
	UpdatedAt              time.Time           `json:"updated_at"`
}

type APIDomainCheckResult struct {
	ID                     uint                `json:"id"`
	DomainID               uint                `json:"domain_id"`
	TenantID               uint                `json:"tenant_id"`
	Status                 models.DomainStatus `json:"status"`
	ErrorMessage           string              `json:"error_message,omitempty"`
	ResolvedIP             string              `json:"resolved_ip,omitempty"`
	CertValidFrom          *time.Time          `json:"cert_valid_from,omitempty"`
	CertExpiresAt          *time.Time          `json:"cert_expires_at,omitempty"`
	DaysRemaining          *int                `json:"days_remaining,omitempty"`
	CertIssuer             string              `json:"cert_issuer,omitempty"`
	CertSubject            string              `json:"cert_subject,omitempty"`
	CertCommonName         string              `json:"cert_common_name,omitempty"`
	CertDNSNames           []string            `json:"cert_dns_names,omitempty"`
	CertSerialNumber       string              `json:"cert_serial_number,omitempty"`
	CertFingerprintSHA256  string              `json:"cert_fingerprint_sha256,omitempty"`
	CertSignatureAlgorithm string              `json:"cert_signature_algorithm,omitempty"`
	CheckedAt              time.Time           `json:"checked_at"`
	CreatedAt              time.Time           `json:"created_at"`
}

type APIEndpoint struct {
	ID           uint                            `json:"id"`
	Name         string                          `json:"name"`
	Type         models.NotificationEndpointType `json:"type"`
	Enabled      bool                            `json:"enabled"`
	Config       map[string]string               `json:"config"`
	ConfigMasked map[string]string               `json:"config_masked"`
	CreatedAt    time.Time                       `json:"created_at"`
	UpdatedAt    time.Time                       `json:"updated_at"`
}

type APIPagination struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"page_size"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
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

func toAPITenant(tenant models.Tenant) APITenant {
	return APITenant{
		ID:                   tenant.ID,
		Name:                 tenant.Name,
		Slug:                 tenant.Slug,
		PublicStatusTitle:    tenant.PublicStatusTitle,
		PublicStatusSubtitle: tenant.PublicStatusSubtitle,
		Disabled:             tenant.Disabled,
		CreatedAt:            tenant.CreatedAt,
		UpdatedAt:            tenant.UpdatedAt,
	}
}

func toAPIDomain(domain models.Domain) APIDomain {
	dnsNames, _ := domain.CertDNSNames()

	return APIDomain{
		ID:                     domain.ID,
		Hostname:               domain.Hostname,
		Port:                   domain.Port,
		TargetIP:               domain.TargetIP,
		Enabled:                domain.Enabled,
		Status:                 domain.Status,
		ResolvedIP:             domain.ResolvedIP,
		CertValidFrom:          domain.CertValidFrom,
		CertExpiresAt:          domain.CertExpiresAt,
		DaysRemaining:          domain.DaysRemaining,
		CertIssuer:             domain.CertIssuer,
		CertSubject:            domain.CertSubject,
		CertCommonName:         domain.CertCommonName,
		CertDNSNames:           dnsNames,
		CertSerialNumber:       domain.CertSerialNumber,
		CertFingerprintSHA256:  domain.CertFingerprintSHA256,
		CertSignatureAlgorithm: domain.CertSignatureAlgorithm,
		LastError:              domain.LastError,
		LastCheckedAt:          domain.LastCheckedAt,
		LastSuccessfulAt:       domain.LastSuccessfulAt,
		NextCheckAt:            domain.NextCheckAt,
		CheckIntervalSeconds:   domain.CheckIntervalSeconds,
		CreatedAt:              domain.CreatedAt,
		UpdatedAt:              domain.UpdatedAt,
	}
}

func toAPIDomainCheckResult(result models.DomainCheckResult) APIDomainCheckResult {
	dnsNames, _ := result.CertDNSNames()

	return APIDomainCheckResult{
		ID:                     result.ID,
		DomainID:               result.DomainID,
		TenantID:               result.TenantID,
		Status:                 result.Status,
		ErrorMessage:           result.ErrorMessage,
		ResolvedIP:             result.ResolvedIP,
		CertValidFrom:          result.CertValidFrom,
		CertExpiresAt:          result.CertExpiresAt,
		DaysRemaining:          result.DaysRemaining,
		CertIssuer:             result.CertIssuer,
		CertSubject:            result.CertSubject,
		CertCommonName:         result.CertCommonName,
		CertDNSNames:           dnsNames,
		CertSerialNumber:       result.CertSerialNumber,
		CertFingerprintSHA256:  result.CertFingerprintSHA256,
		CertSignatureAlgorithm: result.CertSignatureAlgorithm,
		CheckedAt:              result.CheckedAt,
		CreatedAt:              result.CreatedAt,
	}
}

func (s *Server) toAPIEndpoint(endpoint models.NotificationEndpoint) APIEndpoint {
	config := models.MustEndpointConfig(endpoint.Config)
	return APIEndpoint{
		ID:           endpoint.ID,
		Name:         endpoint.Name,
		Type:         endpoint.Type,
		Enabled:      endpoint.Enabled,
		Config:       config,
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
	case errors.Is(err, auth.ErrTenantDisabled):
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
