package scheduler

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/luodaoyi/Certwarden/apps/api/internal/config"
	"github.com/luodaoyi/Certwarden/apps/api/internal/models"
	"github.com/luodaoyi/Certwarden/apps/api/internal/sslcheck"
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

func TestRetryIntervalUsesCappedExponentialBackoff(t *testing.T) {
	tests := []struct {
		failures int
		want     time.Duration
	}{
		{failures: 1, want: time.Minute},
		{failures: 2, want: 2 * time.Minute},
		{failures: 3, want: 4 * time.Minute},
		{failures: 6, want: 32 * time.Minute},
		{failures: 7, want: time.Hour},
		{failures: 20, want: time.Hour},
	}

	for _, test := range tests {
		if got := retryInterval(test.failures); got != test.want {
			t.Fatalf("failures=%d: expected %s, got %s", test.failures, test.want, got)
		}
	}
}

func TestScheduleNextCheckRetriesOnlyTransientFailures(t *testing.T) {
	now := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	domain := models.Domain{CheckIntervalSeconds: 7200, ConsecutiveFailures: 2}

	next, failures := scheduleNextCheck(domain, sslcheck.Result{
		Status:    models.DomainStatusError,
		Retryable: true,
	}, now, 2*time.Hour)
	if failures != 3 || !next.Equal(now.Add(4*time.Minute)) {
		t.Fatalf("expected third transient failure to retry in 4m, got failures=%d next=%s", failures, next)
	}

	next, failures = scheduleNextCheck(domain, sslcheck.Result{
		Status:    models.DomainStatusError,
		Retryable: false,
	}, now, 2*time.Hour)
	if failures != 0 || !next.Equal(now.Add(2*time.Hour)) {
		t.Fatalf("expected certificate error to use regular cadence, got failures=%d next=%s", failures, next)
	}
}

func TestDispatchIntervalKeepsRetrySchedulingResponsive(t *testing.T) {
	if got := dispatchInterval(2 * time.Hour); got != time.Minute {
		t.Fatalf("expected one-minute scheduler polling, got %s", got)
	}
	if got := dispatchInterval(30 * time.Second); got != 30*time.Second {
		t.Fatalf("expected shorter configured interval to be preserved, got %s", got)
	}
}

func TestStopLeavesJobsChannelOpen(t *testing.T) {
	_, cancel := context.WithCancel(context.Background())
	service := &Service{
		cancel: cancel,
		jobs:   make(chan scanTask, 1),
		logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	}

	service.Stop()

	defer func() {
		if recovered := recover(); recovered != nil {
			t.Fatalf("expected jobs channel to remain open during stop, got panic: %v", recovered)
		}
	}()

	service.jobs <- scanTask{domainID: 1}
}

func TestCheckJobReportsProgressAndEnforcesTenantOwnership(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	service := &Service{
		runCtx:    ctx,
		jobs:      make(chan scanTask, 1),
		checkJobs: make(map[string]*checkJob),
	}

	started, err := service.StartCheckJob(7, "single", []CheckTarget{{DomainID: 9, Hostname: "example.com"}})
	if err != nil {
		t.Fatalf("start check job: %v", err)
	}
	if _, _, _, err := service.CheckJobEvents(8, started.JobID, 0); !errors.Is(err, ErrCheckJobNotFound) {
		t.Fatalf("expected tenant isolation, got %v", err)
	}

	task := <-service.jobs
	task.onStart()
	task.result <- scanOutcome{domain: &models.Domain{ID: 9, Hostname: "example.com", Status: models.DomainStatusHealthy}}

	deadline := time.Now().Add(time.Second)
	for {
		events, done, _, err := service.CheckJobEvents(7, started.JobID, 0)
		if err != nil {
			t.Fatalf("read check job: %v", err)
		}
		if done {
			if len(events) != 4 || events[0].Type != "job.started" || events[1].Type != "domain.started" || events[2].Type != "domain.completed" || events[3].Type != "job.completed" {
				t.Fatalf("unexpected events: %+v", events)
			}
			if events[3].Succeeded != 1 || events[3].Failed != 0 || events[3].Status != "completed" {
				t.Fatalf("unexpected completion: %+v", events[3])
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("timed out waiting for check job")
		}
		time.Sleep(time.Millisecond)
	}
}

func TestSchedulerPanicIsReportedWithoutCrashingProcess(t *testing.T) {
	service := NewService(
		nil,
		config.Config{ScanConcurrency: 1, ScanInterval: time.Hour},
		nil,
		nil,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	service.Start(context.Background())

	select {
	case err := <-service.Errors():
		if err == nil || !strings.Contains(err.Error(), "scheduler loop panicked") {
			t.Fatalf("expected scheduler panic error, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for scheduler panic error")
	}

	service.Stop()
}
