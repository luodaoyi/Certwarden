package httpapi

import (
	"context"
	"net/http"

	"go-check-ssl/apps/api/internal/database"
	"go-check-ssl/apps/api/internal/notify"
	"go-check-ssl/apps/api/internal/models"

	"gorm.io/gorm"
)

type adminRegistrationRequest struct {
	Enabled bool `json:"enabled"`
}

type adminUserListItem struct {
	User   APIUser `json:"user"`
	Tenant struct {
		ID   uint   `json:"id"`
		Name string `json:"name"`
		Slug string `json:"slug"`
	} `json:"tenant"`
}

func (s *Server) handleAdminSettings(w http.ResponseWriter, r *http.Request) {
	enabled, err := database.GetRegistrationEnabled(r.Context(), s.db, s.cfg.AllowRegistration)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"allow_registration": enabled})
}

func (s *Server) handleAdminSetRegistration(w http.ResponseWriter, r *http.Request) {
	var input adminRegistrationRequest
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := database.SetRegistrationEnabled(r.Context(), s.db, input.Enabled); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"allow_registration": input.Enabled})
}

func (s *Server) handleAdminListUsers(w http.ResponseWriter, r *http.Request) {
	var users []models.User
	if err := s.db.WithContext(r.Context()).
		Order("created_at asc").
		Find(&users).Error; err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	tenantIDs := make([]uint, 0, len(users))
	seen := map[uint]struct{}{}
	for _, user := range users {
		if _, ok := seen[user.TenantID]; ok {
			continue
		}
		seen[user.TenantID] = struct{}{}
		tenantIDs = append(tenantIDs, user.TenantID)
	}
	var tenants []models.Tenant
	if len(tenantIDs) > 0 {
		if err := s.db.WithContext(r.Context()).Where("id IN ?", tenantIDs).Find(&tenants).Error; err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	tenantMap := map[uint]models.Tenant{}
	for _, tenant := range tenants {
		tenantMap[tenant.ID] = tenant
	}

	response := make([]adminUserListItem, 0, len(users))
	for _, user := range users {
		item := adminUserListItem{User: toAPIUser(user)}
		if tenant, ok := tenantMap[user.TenantID]; ok {
			item.Tenant.ID = tenant.ID
			item.Tenant.Name = tenant.Name
			item.Tenant.Slug = tenant.Slug
		}
		response = append(response, item)
	}

	writeJSON(w, http.StatusOK, map[string]any{"users": response})
}

func (s *Server) handleAdminGetUser(w http.ResponseWriter, r *http.Request) {
	user, tenant, err := s.loadManagedUser(r.Context(), r)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	domains, err := s.listDomains(r.Context(), user.TenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	endpoints, err := s.listEndpoints(r.Context(), user.TenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	policies, err := s.notify.GetPolicies(r.Context(), user.TenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"user":      toAPIUser(*user),
		"tenant":    tenant,
		"domains":   domains,
		"endpoints": endpoints,
		"policies":  policies,
	})
}

func (s *Server) handleAdminCreateDomain(w http.ResponseWriter, r *http.Request) {
	user, _, err := s.loadManagedUser(r.Context(), r)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.handleUpsertDomain(w, r, user.TenantID, 0, http.StatusCreated)
}

func (s *Server) handleAdminUpdateDomain(w http.ResponseWriter, r *http.Request) {
	user, _, err := s.loadManagedUser(r.Context(), r)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	domainID, err := parseUintParam(r, "domainID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid domain id")
		return
	}
	s.handleUpsertDomain(w, r, user.TenantID, domainID, http.StatusOK)
}

func (s *Server) handleAdminDeleteDomain(w http.ResponseWriter, r *http.Request) {
	user, _, err := s.loadManagedUser(r.Context(), r)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	domainID, err := parseUintParam(r, "domainID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid domain id")
		return
	}
	if err := s.deleteDomain(r.Context(), user.TenantID, domainID); err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "domain not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleAdminManualCheck(w http.ResponseWriter, r *http.Request) {
	user, _, err := s.loadManagedUser(r.Context(), r)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	domainID, err := parseUintParam(r, "domainID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid domain id")
		return
	}
	domain, err := s.findDomain(r.Context(), user.TenantID, domainID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "domain not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	checked, err := s.scheduler.CheckDomainNow(r.Context(), domain.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"domain": toAPIDomain(*checked)})
}

func (s *Server) handleAdminCreateEndpoint(w http.ResponseWriter, r *http.Request) {
	user, _, err := s.loadManagedUser(r.Context(), r)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.handleUpsertEndpoint(w, r, user.TenantID, 0, http.StatusCreated)
}

func (s *Server) handleAdminUpdateEndpoint(w http.ResponseWriter, r *http.Request) {
	user, _, err := s.loadManagedUser(r.Context(), r)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	endpointID, err := parseUintParam(r, "endpointID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid endpoint id")
		return
	}
	s.handleUpsertEndpoint(w, r, user.TenantID, endpointID, http.StatusOK)
}

func (s *Server) handleAdminDeleteEndpoint(w http.ResponseWriter, r *http.Request) {
	user, _, err := s.loadManagedUser(r.Context(), r)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	endpointID, err := parseUintParam(r, "endpointID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid endpoint id")
		return
	}
	if err := s.deleteEndpoint(r.Context(), user.TenantID, endpointID); err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "endpoint not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleAdminUpsertDefaultPolicy(w http.ResponseWriter, r *http.Request) {
	user, _, err := s.loadManagedUser(r.Context(), r)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.handlePolicyUpsert(w, r, user.TenantID, 0)
}

func (s *Server) handleAdminUpsertDomainPolicy(w http.ResponseWriter, r *http.Request) {
	user, _, err := s.loadManagedUser(r.Context(), r)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	domainID, err := parseUintParam(r, "domainID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid domain id")
		return
	}
	if _, err := s.findDomain(r.Context(), user.TenantID, domainID); err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "domain not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.handlePolicyUpsert(w, r, user.TenantID, domainID)
}

func (s *Server) loadManagedUser(ctx context.Context, r *http.Request) (*models.User, *models.Tenant, error) {
	userID, err := parseUintParam(r, "userID")
	if err != nil {
		return nil, nil, err
	}

	var user models.User
	if err := s.db.WithContext(ctx).First(&user, userID).Error; err != nil {
		return nil, nil, err
	}
	var tenant models.Tenant
	if err := s.db.WithContext(ctx).First(&tenant, user.TenantID).Error; err != nil {
		return nil, nil, err
	}
	return &user, &tenant, nil
}

var _ = notify.PolicyView{}
var _ = gorm.ErrRecordNotFound
