package models

import (
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"
)

type UserRole string

const (
	RoleSuperAdmin UserRole = "super_admin"
	RoleTenantOwner UserRole = "tenant_owner"
)

type DomainStatus string

const (
	DomainStatusPending DomainStatus = "pending"
	DomainStatusHealthy DomainStatus = "healthy"
	DomainStatusError   DomainStatus = "error"
)

type NotificationEndpointType string

const (
	NotificationEndpointEmail    NotificationEndpointType = "email"
	NotificationEndpointTelegram NotificationEndpointType = "telegram"
	NotificationEndpointWebhook  NotificationEndpointType = "webhook"
)

type NotificationPolicyScope string

const (
	NotificationPolicyScopeTenant NotificationPolicyScope = "tenant"
	NotificationPolicyScopeDomain NotificationPolicyScope = "domain"
)

type Tenant struct {
	ID        uint      `gorm:"primaryKey"`
	Name      string    `gorm:"size:120;not null"`
	Slug      string    `gorm:"size:160;not null;uniqueIndex"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

type User struct {
	ID              uint      `gorm:"primaryKey"`
	TenantID        uint      `gorm:"not null;index"`
	Email           string    `gorm:"size:255;not null;uniqueIndex"`
	PasswordHash    string    `gorm:"size:255;not null"`
	Role            UserRole  `gorm:"size:32;not null;index"`
	EmailVerifiedAt *time.Time
	LastLoginAt     *time.Time
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type AuthSession struct {
	ID        uint       `gorm:"primaryKey"`
	UserID    uint       `gorm:"not null;index"`
	TenantID  uint       `gorm:"not null;index"`
	TokenHash string     `gorm:"size:128;not null;uniqueIndex"`
	UserAgent string     `gorm:"size:255"`
	IPAddress string     `gorm:"size:64"`
	ExpiresAt time.Time  `gorm:"not null;index"`
	RevokedAt *time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
}

type EmailVerificationToken struct {
	ID         uint       `gorm:"primaryKey"`
	UserID     uint       `gorm:"not null;index"`
	TokenHash  string     `gorm:"size:128;not null;uniqueIndex"`
	ExpiresAt  time.Time  `gorm:"not null;index"`
	ConsumedAt *time.Time
	CreatedAt  time.Time
}

type PasswordResetToken struct {
	ID         uint       `gorm:"primaryKey"`
	UserID     uint       `gorm:"not null;index"`
	TokenHash  string     `gorm:"size:128;not null;uniqueIndex"`
	ExpiresAt  time.Time  `gorm:"not null;index"`
	ConsumedAt *time.Time
	CreatedAt  time.Time
}

type Domain struct {
	ID                   uint         `gorm:"primaryKey"`
	TenantID             uint         `gorm:"not null;index;uniqueIndex:idx_domain_host_port_tenant"`
	Hostname             string       `gorm:"size:255;not null;uniqueIndex:idx_domain_host_port_tenant"`
	Port                 int          `gorm:"not null;default:443;uniqueIndex:idx_domain_host_port_tenant"`
	Enabled              bool         `gorm:"not null;default:true"`
	Status               DomainStatus `gorm:"size:32;not null;default:'pending'"`
	LastCheckedAt        *time.Time
	LastSuccessfulAt     *time.Time
	CertExpiresAt        *time.Time
	DaysRemaining        *int
	LastError            string       `gorm:"type:text"`
	NextCheckAt          time.Time    `gorm:"not null;index"`
	CheckIntervalSeconds int          `gorm:"not null;default:3600"`
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

type DomainCheckResult struct {
	ID            uint         `gorm:"primaryKey"`
	DomainID      uint         `gorm:"not null;index"`
	TenantID      uint         `gorm:"not null;index"`
	Status        DomainStatus `gorm:"size:32;not null;index"`
	ErrorMessage  string       `gorm:"type:text"`
	CertExpiresAt *time.Time
	DaysRemaining *int
	CheckedAt     time.Time `gorm:"not null;index"`
	CreatedAt     time.Time
}

type NotificationEndpoint struct {
	ID        uint                     `gorm:"primaryKey"`
	TenantID  uint                     `gorm:"not null;index"`
	Name      string                   `gorm:"size:120;not null"`
	Type      NotificationEndpointType `gorm:"size:32;not null;index"`
	Enabled   bool                     `gorm:"not null;default:true"`
	Config    string                   `gorm:"type:text;not null"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

type NotificationPolicy struct {
	ID             uint                    `gorm:"primaryKey"`
	TenantID       uint                    `gorm:"not null;index;uniqueIndex:idx_policy_scope"`
	ScopeType      NotificationPolicyScope `gorm:"size:32;not null;uniqueIndex:idx_policy_scope"`
	DomainID       uint                    `gorm:"not null;default:0;uniqueIndex:idx_policy_scope"`
	ThresholdsJSON string                  `gorm:"type:text;not null"`
	EndpointIDsJSON string                 `gorm:"type:text;not null"`
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type NotificationDelivery struct {
	ID            uint       `gorm:"primaryKey"`
	TenantID      uint       `gorm:"not null;index"`
	DomainID      uint       `gorm:"not null;index"`
	EndpointID    uint       `gorm:"not null;index"`
	EventType     string     `gorm:"size:64;not null;index"`
	ThresholdDays int        `gorm:"not null;default:0"`
	DedupKey      string     `gorm:"size:255;not null;uniqueIndex"`
	Status        string     `gorm:"size:32;not null;index"`
	ErrorMessage  string     `gorm:"type:text"`
	Payload       string     `gorm:"type:text"`
	CertExpiresAt *time.Time
	SentAt        *time.Time
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

type SystemSetting struct {
	Key       string    `gorm:"primaryKey;size:100"`
	Value     string    `gorm:"type:text;not null"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (p NotificationPolicy) ThresholdDays() ([]int, error) {
	return parseIntSlice(p.ThresholdsJSON)
}

func (p *NotificationPolicy) SetThresholdDays(values []int) error {
	normalized := normalizeThresholds(values)
	encoded, err := json.Marshal(normalized)
	if err != nil {
		return err
	}
	p.ThresholdsJSON = string(encoded)
	return nil
}

func (p NotificationPolicy) EndpointIDs() ([]uint, error) {
	return parseUintSlice(p.EndpointIDsJSON)
}

func (p *NotificationPolicy) SetEndpointIDs(values []uint) error {
	normalized := normalizeUintIDs(values)
	encoded, err := json.Marshal(normalized)
	if err != nil {
		return err
	}
	p.EndpointIDsJSON = string(encoded)
	return nil
}

func ParseEndpointConfig(raw string) (map[string]string, error) {
	if strings.TrimSpace(raw) == "" {
		return map[string]string{}, nil
	}
	config := map[string]string{}
	if err := json.Unmarshal([]byte(raw), &config); err != nil {
		return nil, err
	}
	return config, nil
}

func MustEndpointConfig(raw string) map[string]string {
	config, err := ParseEndpointConfig(raw)
	if err != nil {
		return map[string]string{}
	}
	return config
}

func SetEndpointConfig(values map[string]string) (string, error) {
	if values == nil {
		values = map[string]string{}
	}
	encoded, err := json.Marshal(values)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

func normalizeThresholds(values []int) []int {
	seen := map[int]struct{}{}
	out := make([]int, 0, len(values))
	for _, value := range values {
		if value < 0 {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	sort.Ints(out)
	return out
}

func normalizeUintIDs(values []uint) []uint {
	seen := map[uint]struct{}{}
	out := make([]uint, 0, len(values))
	for _, value := range values {
		if value == 0 {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

func parseIntSlice(raw string) ([]int, error) {
	if strings.TrimSpace(raw) == "" {
		return []int{}, nil
	}
	values := []int{}
	if err := json.Unmarshal([]byte(raw), &values); err != nil {
		return nil, err
	}
	return normalizeThresholds(values), nil
}

func parseUintSlice(raw string) ([]uint, error) {
	if strings.TrimSpace(raw) == "" {
		return []uint{}, nil
	}
	values := []uint{}
	if err := json.Unmarshal([]byte(raw), &values); err != nil {
		return nil, err
	}
	return normalizeUintIDs(values), nil
}

var ErrInvalidEndpointConfig = errors.New("invalid endpoint config")
