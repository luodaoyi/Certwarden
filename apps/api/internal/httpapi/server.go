package httpapi

import (
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/luodaoyi/Certwarden/apps/api/internal/auth"
	"github.com/luodaoyi/Certwarden/apps/api/internal/config"
	"github.com/luodaoyi/Certwarden/apps/api/internal/models"
	"github.com/luodaoyi/Certwarden/apps/api/internal/notify"
	"github.com/luodaoyi/Certwarden/apps/api/internal/scheduler"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"gorm.io/gorm"
)

const refreshCookieName = "certwarden_refresh"

type Server struct {
	cfg       config.Config
	db        *gorm.DB
	auth      *auth.Service
	notify    *notify.Service
	scheduler *scheduler.Service
	logger    *slog.Logger
}

func NewServer(cfg config.Config, db *gorm.DB, authService *auth.Service, notifyService *notify.Service, schedulerService *scheduler.Service, logger *slog.Logger) *Server {
	return &Server{
		cfg:       cfg,
		db:        db,
		auth:      authService,
		notify:    notifyService,
		scheduler: schedulerService,
		logger:    logger,
	}
}

func (s *Server) Router() http.Handler {
	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)
	router.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://127.0.0.1:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	router.Get("/api/system/health", s.handleHealth)

	router.Route("/api/auth", func(r chi.Router) {
		r.Post("/register", s.handleRegister)
		r.Post("/login", s.handleLogin)
		r.Post("/refresh", s.handleRefresh)
		r.Post("/logout", s.handleLogout)
		r.Post("/verify-email", s.handleVerifyEmail)
		r.Post("/forgot-password", s.handleForgotPassword)
		r.Post("/reset-password", s.handleResetPassword)

		r.Group(func(authenticated chi.Router) {
			authenticated.Use(s.requireAuth)
			authenticated.Get("/me", s.handleMe)
			authenticated.Put("/me", s.handleUpdateMe)
		})
	})

	router.Route("/api", func(r chi.Router) {
		r.Use(s.requireAuth)

		r.Route("/domains", func(domains chi.Router) {
			domains.Get("/", s.handleListDomains)
			domains.Post("/", s.handleCreateDomain)
			domains.Get("/{domainID}", s.handleGetDomain)
			domains.Put("/{domainID}", s.handleUpdateDomain)
			domains.Delete("/{domainID}", s.handleDeleteDomain)
			domains.Post("/{domainID}/check", s.handleManualCheck)
			domains.Get("/{domainID}/history", s.handleDomainHistory)
		})

		r.Route("/notification-endpoints", func(endpoints chi.Router) {
			endpoints.Get("/", s.handleListEndpoints)
			endpoints.Post("/", s.handleCreateEndpoint)
			endpoints.Put("/{endpointID}", s.handleUpdateEndpoint)
			endpoints.Delete("/{endpointID}", s.handleDeleteEndpoint)
		})

		r.Route("/notification-policies", func(policies chi.Router) {
			policies.Get("/", s.handleGetPolicies)
			policies.Put("/default", s.handleUpsertDefaultPolicy)
			policies.Put("/domains/{domainID}", s.handleUpsertDomainPolicy)
		})

		r.Route("/admin", func(admin chi.Router) {
			admin.Use(s.requireAdmin)

			admin.Get("/settings", s.handleAdminSettings)
			admin.Put("/settings/registration", s.handleAdminSetRegistration)
			admin.Get("/users", s.handleAdminListUsers)
			admin.Get("/users/{userID}", s.handleAdminGetUser)
			admin.Put("/users/{userID}/profile", s.handleAdminUpdateUserProfile)

			admin.Post("/users/{userID}/domains", s.handleAdminCreateDomain)
			admin.Put("/users/{userID}/domains/{domainID}", s.handleAdminUpdateDomain)
			admin.Delete("/users/{userID}/domains/{domainID}", s.handleAdminDeleteDomain)
			admin.Post("/users/{userID}/domains/{domainID}/check", s.handleAdminManualCheck)

			admin.Post("/users/{userID}/notification-endpoints", s.handleAdminCreateEndpoint)
			admin.Put("/users/{userID}/notification-endpoints/{endpointID}", s.handleAdminUpdateEndpoint)
			admin.Delete("/users/{userID}/notification-endpoints/{endpointID}", s.handleAdminDeleteEndpoint)

			admin.Put("/users/{userID}/notification-policies/default", s.handleAdminUpsertDefaultPolicy)
			admin.Put("/users/{userID}/notification-policies/domains/{domainID}", s.handleAdminUpsertDomainPolicy)
		})
	})

	if strings.TrimSpace(s.cfg.WebDistDir) != "" {
		router.NotFound(s.serveFrontend())
		router.Get("/", s.serveFrontend())
	}

	return router
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ok",
		"time":   time.Now().UTC(),
	})
}

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
		if header == "" {
			writeError(w, http.StatusUnauthorized, "missing bearer token")
			return
		}

		claims, err := s.auth.ParseAccessToken(header)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid access token")
			return
		}

		next.ServeHTTP(w, r.WithContext(withUser(r.Context(), AuthUser{
			ID:       claims.UserID,
			TenantID: claims.TenantID,
			Role:     claims.Role,
			Username: claims.Username,
		})))
	})
}

func (s *Server) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := currentUser(r.Context())
		if !ok {
			writeError(w, http.StatusUnauthorized, "missing authenticated user")
			return
		}
		if user.Role != models.RoleSuperAdmin {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) setRefreshCookie(w http.ResponseWriter, rawToken string, expiresAt time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    rawToken,
		Path:     "/api/auth",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   s.cfg.IsProduction(),
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    "",
		Path:     "/api/auth",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.cfg.IsProduction(),
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) serveFrontend() http.HandlerFunc {
	fileServer := http.FileServer(http.Dir(s.cfg.WebDistDir))
	return func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}

		fullPath := filepath.Join(s.cfg.WebDistDir, filepath.Clean(r.URL.Path))
		if info, err := os.Stat(fullPath); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}
		if info, err := os.Stat(s.cfg.WebDistDir); err != nil || !info.IsDir() {
			writeError(w, http.StatusNotFound, "frontend assets are not available")
			return
		}
		if _, err := os.Stat(filepath.Join(s.cfg.WebDistDir, "index.html")); err != nil {
			if errors, ok := err.(*fs.PathError); ok && errors != nil {
				writeError(w, http.StatusNotFound, "frontend assets are not available")
				return
			}
		}
		http.ServeFile(w, r, filepath.Join(s.cfg.WebDistDir, "index.html"))
	}
}
