package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/luodaoyi/Certwarden/apps/api/internal/models"
	"github.com/luodaoyi/Certwarden/apps/api/internal/scheduler"
)

func (s *Server) handleManualCheck(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
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

	started, err := s.scheduler.StartCheckJob(user.TenantID, "single", []scheduler.CheckTarget{{
		DomainID: domain.ID,
		Hostname: domain.Hostname,
	}})
	if err != nil {
		s.writeCheckJobError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, started)
}

func (s *Server) handleManualCheckAll(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	var domains []models.Domain
	if err := s.db.WithContext(r.Context()).
		Where("tenant_id = ?", user.TenantID).
		Order("hostname asc, port asc, target_ip asc").
		Find(&domains).Error; err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	targets := make([]scheduler.CheckTarget, 0, len(domains))
	for _, domain := range domains {
		targets = append(targets, scheduler.CheckTarget{DomainID: domain.ID, Hostname: domain.Hostname})
	}

	started, err := s.scheduler.StartCheckJob(user.TenantID, "all", targets)
	if err != nil {
		s.writeCheckJobError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, started)
}

func (s *Server) handleCheckJobEvents(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r.Context())
	jobID := chi.URLParam(r, "jobID")
	lastEventID, _ := strconv.ParseInt(r.Header.Get("Last-Event-ID"), 10, 64)

	events, done, signal, err := s.scheduler.CheckJobEvents(user.TenantID, jobID, lastEventID)
	if err != nil {
		if errors.Is(err, scheduler.ErrCheckJobNotFound) {
			writeError(w, http.StatusNotFound, "check job not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming is not supported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	_, _ = fmt.Fprint(w, "retry: 3000\n\n")
	flusher.Flush()

	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()
	for {
		for _, event := range events {
			payload, marshalErr := json.Marshal(event)
			if marshalErr != nil {
				return
			}
			_, _ = fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", event.ID, event.Type, payload)
			lastEventID = event.ID
		}
		flusher.Flush()
		if done {
			return
		}

		select {
		case <-r.Context().Done():
			return
		case <-signal:
		case <-heartbeat.C:
			_, _ = fmt.Fprint(w, ": keep-alive\n\n")
			flusher.Flush()
		}
		events, done, signal, err = s.scheduler.CheckJobEvents(user.TenantID, jobID, lastEventID)
		if err != nil {
			return
		}
	}
}

func (s *Server) writeCheckJobError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, scheduler.ErrNoCheckTargets):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, scheduler.ErrSchedulerNotRunning):
		writeError(w, http.StatusServiceUnavailable, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, err.Error())
	}
}
