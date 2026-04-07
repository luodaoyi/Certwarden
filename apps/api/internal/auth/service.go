package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/luodaoyi/Certwarden/apps/api/internal/config"
	"github.com/luodaoyi/Certwarden/apps/api/internal/database"
	"github.com/luodaoyi/Certwarden/apps/api/internal/mailer"
	"github.com/luodaoyi/Certwarden/apps/api/internal/models"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrInvalidCredentials   = errors.New("invalid credentials")
	ErrRegistrationDisabled = errors.New("registration disabled")
	ErrEmailNotVerified     = errors.New("email not verified")
	ErrInvalidToken         = errors.New("invalid token")
	ErrTokenExpired         = errors.New("token expired")
	ErrConflict             = errors.New("resource already exists")
)

type RegisterInput struct {
	Username   string
	Password   string
	TenantName string
}

type LoginInput struct {
	Username  string
	Password  string
	UserAgent string
	IPAddress string
}

type UpdateProfileInput struct {
	Username string
	Email    string
}

type ResetPasswordInput struct {
	Token       string
	NewPassword string
}

type SessionTokens struct {
	AccessToken      string    `json:"access_token"`
	AccessExpiresAt  time.Time `json:"access_expires_at"`
	RefreshToken     string    `json:"-"`
	RefreshExpiresAt time.Time `json:"refresh_expires_at"`
}

type AccessClaims struct {
	UserID   uint            `json:"uid"`
	TenantID uint            `json:"tenant_id"`
	Role     models.UserRole `json:"role"`
	Username string          `json:"username"`
	jwt.RegisteredClaims
}

type Service struct {
	db     *gorm.DB
	cfg    config.Config
	mailer mailer.Sender
	logger *slog.Logger
	now    func() time.Time
}

func NewService(db *gorm.DB, cfg config.Config, sender mailer.Sender, logger *slog.Logger) *Service {
	return &Service{
		db:     db,
		cfg:    cfg,
		mailer: sender,
		logger: logger,
		now: func() time.Time {
			return time.Now().UTC()
		},
	}
}

func (s *Service) Register(ctx context.Context, input RegisterInput) (*models.User, error) {
	allowed, err := database.GetRegistrationEnabled(ctx, s.db, s.cfg.AllowRegistration)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, ErrRegistrationDisabled
	}

	username := strings.TrimSpace(input.Username)
	usernameNormalized := normalizeUsername(input.Username)
	if err := validateUsername(username); err != nil {
		return nil, err
	}
	if err := validatePassword(input.Password); err != nil {
		return nil, err
	}

	tenantName := strings.TrimSpace(input.TenantName)
	if tenantName == "" {
		tenantName = deriveTenantName(username)
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	var createdUser models.User

	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing models.User
		if err := tx.Where("username_normalized = ?", usernameNormalized).First(&existing).Error; err == nil {
			return ErrConflict
		} else if err != nil && err != gorm.ErrRecordNotFound {
			return err
		}

		slug, err := uniqueTenantSlug(tx, tenantName)
		if err != nil {
			return err
		}

		tenant := models.Tenant{Name: tenantName, Slug: slug}
		if err := tx.Create(&tenant).Error; err != nil {
			return err
		}

		internalEmail, err := generateInternalEmail()
		if err != nil {
			return err
		}

		createdUser = models.User{
			TenantID:           tenant.ID,
			Username:           username,
			UsernameNormalized: usernameNormalized,
			Email:              internalEmail,
			PasswordHash:       string(passwordHash),
			Role:               models.RoleTenantOwner,
		}
		if err := tx.Create(&createdUser).Error; err != nil {
			return err
		}

		policy := models.NotificationPolicy{
			TenantID:  tenant.ID,
			ScopeType: models.NotificationPolicyScopeTenant,
			DomainID:  0,
		}
		if err := policy.SetThresholdDays([]int{30, 7, 1}); err != nil {
			return err
		}
		if err := policy.SetEndpointIDs([]uint{}); err != nil {
			return err
		}
		return tx.Create(&policy).Error
	})
	if err != nil {
		return nil, err
	}

	return &createdUser, nil
}

func (s *Service) Login(ctx context.Context, input LoginInput) (*models.User, *SessionTokens, error) {
	usernameNormalized := normalizeUsername(input.Username)

	var user models.User
	if err := s.db.WithContext(ctx).Where("username_normalized = ?", usernameNormalized).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil, ErrInvalidCredentials
		}
		return nil, nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		return nil, nil, ErrInvalidCredentials
	}

	tokens, err := s.createSession(ctx, &user, input.UserAgent, input.IPAddress)
	if err != nil {
		return nil, nil, err
	}

	now := s.now()
	if err := s.db.WithContext(ctx).Model(&models.User{}).Where("id = ?", user.ID).Update("last_login_at", now).Error; err != nil {
		s.logger.Warn("update last login", "error", err, "user_id", user.ID)
	}
	user.LastLoginAt = &now

	return &user, tokens, nil
}

func (s *Service) Refresh(ctx context.Context, rawRefreshToken, userAgent, ipAddress string) (*models.User, *SessionTokens, error) {
	hash := hashToken(rawRefreshToken)
	var session models.AuthSession
	if err := s.db.WithContext(ctx).Where("token_hash = ?", hash).First(&session).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil, ErrInvalidToken
		}
		return nil, nil, err
	}
	if session.RevokedAt != nil {
		return nil, nil, ErrInvalidToken
	}
	if session.ExpiresAt.Before(s.now()) {
		return nil, nil, ErrTokenExpired
	}

	var user models.User
	if err := s.db.WithContext(ctx).First(&user, session.UserID).Error; err != nil {
		return nil, nil, err
	}

	var tokens *SessionTokens
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		now := s.now()
		if err := tx.Model(&models.AuthSession{}).Where("id = ?", session.ID).Update("revoked_at", now).Error; err != nil {
			return err
		}
		created, err := s.createSessionTx(ctx, tx, &user, userAgent, ipAddress)
		if err != nil {
			return err
		}
		tokens = created
		return nil
	})
	if err != nil {
		return nil, nil, err
	}

	return &user, tokens, nil
}

func (s *Service) Logout(ctx context.Context, rawRefreshToken string) error {
	if strings.TrimSpace(rawRefreshToken) == "" {
		return nil
	}
	now := s.now()
	return s.db.WithContext(ctx).Model(&models.AuthSession{}).
		Where("token_hash = ? AND revoked_at IS NULL", hashToken(rawRefreshToken)).
		Update("revoked_at", now).Error
}

func (s *Service) VerifyEmail(ctx context.Context, rawToken string) error {
	hash := hashToken(rawToken)
	now := s.now()

	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var token models.EmailVerificationToken
		if err := tx.Where("token_hash = ?", hash).First(&token).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return ErrInvalidToken
			}
			return err
		}
		if token.ConsumedAt != nil {
			return ErrInvalidToken
		}
		if token.ExpiresAt.Before(now) {
			return ErrTokenExpired
		}

		if err := tx.Model(&models.EmailVerificationToken{}).Where("id = ?", token.ID).Update("consumed_at", now).Error; err != nil {
			return err
		}
		return tx.Model(&models.User{}).Where("id = ?", token.UserID).Update("email_verified_at", now).Error
	})
}

func (s *Service) ForgotPassword(ctx context.Context, account string) error {
	user, err := s.findUserForPasswordReset(ctx, account)
	if err != nil {
		return err
	}
	if user == nil {
		return nil
	}

	var rawToken string
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		rawToken, err = createTokenRecord(tx, &models.PasswordResetToken{
			UserID:    user.ID,
			ExpiresAt: s.now().Add(2 * time.Hour),
		})
		return err
	}); err != nil {
		return err
	}

	link := strings.TrimRight(s.cfg.AppBaseURL, "/") + "/reset-password?token=" + rawToken
	if err := s.mailer.Send(ctx, mailer.Message{
		To:      *user.ContactEmail,
		Subject: "Reset your password",
		Body:    fmt.Sprintf("Reset your password by opening: %s", link),
	}); err != nil {
		s.logger.Error("send reset email", "error", err, "email", *user.ContactEmail)
	}

	return nil
}

func (s *Service) ResetPassword(ctx context.Context, input ResetPasswordInput) error {
	if err := validatePassword(input.NewPassword); err != nil {
		return err
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(input.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	hash := hashToken(input.Token)
	now := s.now()

	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var token models.PasswordResetToken
		if err := tx.Where("token_hash = ?", hash).First(&token).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return ErrInvalidToken
			}
			return err
		}
		if token.ConsumedAt != nil {
			return ErrInvalidToken
		}
		if token.ExpiresAt.Before(now) {
			return ErrTokenExpired
		}

		if err := tx.Model(&models.PasswordResetToken{}).Where("id = ?", token.ID).Update("consumed_at", now).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.User{}).Where("id = ?", token.UserID).Update("password_hash", string(passwordHash)).Error; err != nil {
			return err
		}
		return tx.Model(&models.AuthSession{}).Where("user_id = ? AND revoked_at IS NULL", token.UserID).Update("revoked_at", now).Error
	})
}

func (s *Service) GetUserByID(ctx context.Context, userID uint) (*models.User, error) {
	var user models.User
	if err := s.db.WithContext(ctx).First(&user, userID).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *Service) UpdateProfile(ctx context.Context, userID uint, input UpdateProfileInput) (*models.User, error) {
	username := strings.TrimSpace(input.Username)
	usernameNormalized := normalizeUsername(input.Username)
	if err := validateUsername(username); err != nil {
		return nil, err
	}

	email, emailNormalized := optionalNormalizedEmail(input.Email)

	var user models.User
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&user, userID).Error; err != nil {
			return err
		}

		var usernameOwner models.User
		if err := tx.Where("username_normalized = ? AND id <> ?", usernameNormalized, userID).First(&usernameOwner).Error; err == nil {
			return ErrConflict
		} else if err != nil && err != gorm.ErrRecordNotFound {
			return err
		}

		if emailNormalized != nil {
			var emailOwner models.User
			if err := tx.Where("contact_email_normalized = ? AND id <> ?", *emailNormalized, userID).First(&emailOwner).Error; err == nil {
				return ErrConflict
			} else if err != nil && err != gorm.ErrRecordNotFound {
				return err
			}
		}

		updates := map[string]any{
			"username":                 username,
			"username_normalized":      usernameNormalized,
			"contact_email":            email,
			"contact_email_normalized": emailNormalized,
			"updated_at":               s.now(),
		}

		if user.ContactEmail == nil || email == nil || *user.ContactEmail != *email {
			updates["email_verified_at"] = nil
		}

		if err := tx.Model(&models.User{}).Where("id = ?", userID).Updates(updates).Error; err != nil {
			return err
		}

		return tx.First(&user, userID).Error
	})
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *Service) ParseAccessToken(token string) (*AccessClaims, error) {
	claims := &AccessClaims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method %T", token.Method)
		}
		return []byte(s.cfg.JWTSecret), nil
	})
	if err != nil {
		return nil, ErrInvalidToken
	}
	if !parsed.Valid {
		return nil, ErrInvalidToken
	}
	return claims, nil
}

func (s *Service) createSession(ctx context.Context, user *models.User, userAgent, ipAddress string) (*SessionTokens, error) {
	var tokens *SessionTokens
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		created, err := s.createSessionTx(ctx, tx, user, userAgent, ipAddress)
		if err != nil {
			return err
		}
		tokens = created
		return nil
	})
	return tokens, err
}

func (s *Service) createSessionTx(ctx context.Context, tx *gorm.DB, user *models.User, userAgent, ipAddress string) (*SessionTokens, error) {
	accessToken, accessExpiry, err := s.buildAccessToken(user)
	if err != nil {
		return nil, err
	}
	refreshToken, err := generateRawToken(48)
	if err != nil {
		return nil, err
	}
	refreshExpiry := s.now().Add(s.cfg.RefreshTokenTTL)

	session := models.AuthSession{
		UserID:    user.ID,
		TenantID:  user.TenantID,
		TokenHash: hashToken(refreshToken),
		UserAgent: truncate(userAgent, 255),
		IPAddress: truncate(ipAddress, 64),
		ExpiresAt: refreshExpiry,
	}
	if err := tx.WithContext(ctx).Create(&session).Error; err != nil {
		return nil, err
	}

	return &SessionTokens{
		AccessToken:      accessToken,
		AccessExpiresAt:  accessExpiry,
		RefreshToken:     refreshToken,
		RefreshExpiresAt: refreshExpiry,
	}, nil
}

func (s *Service) buildAccessToken(user *models.User) (string, time.Time, error) {
	expiresAt := s.now().Add(s.cfg.AccessTokenTTL)
	claims := AccessClaims{
		UserID:   user.ID,
		TenantID: user.TenantID,
		Role:     user.Role,
		Username: user.Username,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.FormatUint(uint64(user.ID), 10),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(s.now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(s.cfg.JWTSecret))
	return signed, expiresAt, err
}

func createTokenRecord[T interface {
	*models.EmailVerificationToken | *models.PasswordResetToken
}](tx *gorm.DB, record T) (string, error) {
	raw, err := generateRawToken(48)
	if err != nil {
		return "", err
	}
	switch v := any(record).(type) {
	case *models.EmailVerificationToken:
		v.TokenHash = hashToken(raw)
		if err := tx.Create(v).Error; err != nil {
			return "", err
		}
	case *models.PasswordResetToken:
		v.TokenHash = hashToken(raw)
		if err := tx.Create(v).Error; err != nil {
			return "", err
		}
	default:
		return "", fmt.Errorf("unsupported token type")
	}
	return raw, nil
}

func generateRawToken(size int) (string, error) {
	buffer := make([]byte, size)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func normalizeUsername(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}

func validatePassword(password string) error {
	if len(strings.TrimSpace(password)) < 8 {
		return fmt.Errorf("password must be at least 8 characters")
	}
	return nil
}

var usernamePattern = regexp.MustCompile(`^[\p{L}\p{N}][\p{L}\p{N}._-]{2,31}$`)

func validateUsername(username string) error {
	username = strings.TrimSpace(username)
	if utf8.RuneCountInString(username) < 3 {
		return fmt.Errorf("username must be at least 3 characters")
	}
	if utf8.RuneCountInString(username) > 32 {
		return fmt.Errorf("username must be at most 32 characters")
	}
	if !usernamePattern.MatchString(username) {
		return fmt.Errorf("username may only contain letters, numbers, dot, underscore, and dash")
	}
	return nil
}

var nonSlugRegex = regexp.MustCompile(`[^a-z0-9]+`)

func uniqueTenantSlug(tx *gorm.DB, name string) (string, error) {
	base := slugify(name)
	if base == "" {
		base = "tenant"
	}
	candidate := base
	for index := 1; index < 1000; index++ {
		var count int64
		if err := tx.Model(&models.Tenant{}).Where("slug = ?", candidate).Count(&count).Error; err != nil {
			return "", err
		}
		if count == 0 {
			return candidate, nil
		}
		candidate = fmt.Sprintf("%s-%d", base, index+1)
	}
	return "", fmt.Errorf("could not create unique tenant slug")
}

func slugify(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	normalized = nonSlugRegex.ReplaceAllString(normalized, "-")
	normalized = strings.Trim(normalized, "-")
	return normalized
}

func deriveTenantName(username string) string {
	username = strings.TrimSpace(username)
	if username != "" {
		return username + "'s workspace"
	}
	return "New workspace"
}

func truncate(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}

func optionalNormalizedEmail(value string) (*string, *string) {
	normalized := normalizeEmail(value)
	if normalized == "" {
		return nil, nil
	}
	contact := normalized
	return &contact, &contact
}

func generateInternalEmail() (string, error) {
	raw, err := generateRawToken(12)
	if err != nil {
		return "", err
	}
	return "user-" + strings.ToLower(raw) + "@local.invalid", nil
}

func (s *Service) findUserForPasswordReset(ctx context.Context, account string) (*models.User, error) {
	account = strings.TrimSpace(account)
	if account == "" {
		return nil, nil
	}

	var user models.User
	username := normalizeUsername(account)
	if err := s.db.WithContext(ctx).Where("username_normalized = ?", username).First(&user).Error; err == nil {
		if user.ContactEmail != nil {
			return &user, nil
		}
		return nil, nil
	} else if err != gorm.ErrRecordNotFound {
		return nil, err
	}

	email := normalizeEmail(account)
	if email == "" {
		return nil, nil
	}
	if err := s.db.WithContext(ctx).Where("contact_email_normalized = ?", email).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	if user.ContactEmail == nil {
		return nil, nil
	}
	return &user, nil
}
