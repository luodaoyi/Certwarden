package scheduler

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/luodaoyi/Certwarden/apps/api/internal/models"
)

func TestResolveIntervalUsesDomainOverride(t *testing.T) {
	domain := models.Domain{CheckIntervalSeconds: 120}
	if got := resolveInterval(domain, time.Hour); got != 120*time.Second {
		t.Fatalf("expected 120s, got %s", got)
	}
}

func TestCalculateDaysRemainingTracksExpiredCertificate(t *testing.T) {
	expiresAt := time.Date(2026, time.July, 15, 23, 59, 59, 0, time.UTC)
	now := time.Date(2026, time.July, 20, 2, 25, 33, 0, time.UTC)

	if got := calculateDaysRemaining(expiresAt, now); got != -5 {
		t.Fatalf("expected -5 days remaining, got %d", got)
	}
}

func TestStopLeavesJobsChannelOpen(t *testing.T) {
	_, cancel := context.WithCancel(context.Background())
	service := &Service{
		cancel: cancel,
		jobs:   make(chan uint, 1),
		logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	}

	service.Stop()

	defer func() {
		if recovered := recover(); recovered != nil {
			t.Fatalf("expected jobs channel to remain open during stop, got panic: %v", recovered)
		}
	}()

	service.jobs <- 1
}
