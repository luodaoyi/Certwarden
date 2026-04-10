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
