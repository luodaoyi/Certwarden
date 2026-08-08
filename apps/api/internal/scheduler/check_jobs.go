package scheduler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/luodaoyi/Certwarden/apps/api/internal/models"
)

const checkJobRetention = 10 * time.Minute

var (
	ErrSchedulerNotRunning = errors.New("scheduler is not running")
	ErrCheckJobNotFound    = errors.New("check job not found")
	ErrNoCheckTargets      = errors.New("no domains to check")
)

type CheckTarget struct {
	DomainID uint
	Hostname string
}

type CheckJobStart struct {
	JobID  string `json:"job_id"`
	Mode   string `json:"mode"`
	Status string `json:"status"`
	Total  int    `json:"total"`
}

type CheckEvent struct {
	ID        int64  `json:"id"`
	Type      string `json:"type"`
	JobID     string `json:"job_id"`
	Mode      string `json:"mode"`
	DomainID  uint   `json:"domain_id,omitempty"`
	Hostname  string `json:"hostname,omitempty"`
	Status    string `json:"status,omitempty"`
	Error     string `json:"error,omitempty"`
	Total     int    `json:"total"`
	Completed int    `json:"completed"`
	Succeeded int    `json:"succeeded"`
	Failed    int    `json:"failed"`
}

type scanTask struct {
	domainID uint
	onStart  func()
	result   chan<- scanOutcome
}

type scanOutcome struct {
	domain *models.Domain
	err    error
}

type checkJob struct {
	mu        sync.Mutex
	id        string
	tenantID  uint
	mode      string
	total     int
	completed int
	succeeded int
	failed    int
	done      bool
	events    []CheckEvent
	signal    chan struct{}
}

func (s *Service) StartCheckJob(tenantID uint, mode string, targets []CheckTarget) (CheckJobStart, error) {
	if len(targets) == 0 {
		return CheckJobStart{}, ErrNoCheckTargets
	}

	s.stateMu.RLock()
	runCtx := s.runCtx
	jobs := s.jobs
	s.stateMu.RUnlock()
	if runCtx == nil || jobs == nil || runCtx.Err() != nil {
		return CheckJobStart{}, ErrSchedulerNotRunning
	}

	jobID, err := newCheckJobID()
	if err != nil {
		return CheckJobStart{}, fmt.Errorf("generate check job id: %w", err)
	}
	job := &checkJob{
		id:       jobID,
		tenantID: tenantID,
		mode:     mode,
		total:    len(targets),
		signal:   make(chan struct{}),
	}
	job.appendEvent(CheckEvent{Type: "job.started", Status: "running"})

	s.checkJobsMu.Lock()
	s.checkJobs[jobID] = job
	s.checkJobsMu.Unlock()

	targetCopy := append([]CheckTarget(nil), targets...)
	go s.runCheckJob(runCtx, jobs, job, targetCopy)

	return CheckJobStart{JobID: jobID, Mode: mode, Status: "queued", Total: len(targets)}, nil
}

func (s *Service) CheckJobEvents(tenantID uint, jobID string, afterID int64) ([]CheckEvent, bool, <-chan struct{}, error) {
	s.checkJobsMu.RLock()
	job := s.checkJobs[jobID]
	s.checkJobsMu.RUnlock()
	if job == nil || job.tenantID != tenantID {
		return nil, false, nil, ErrCheckJobNotFound
	}
	return job.snapshot(afterID)
}

func (s *Service) runCheckJob(ctx context.Context, jobs chan<- scanTask, job *checkJob, targets []CheckTarget) {
	defer s.expireCheckJob(job)
	results := make(chan scanOutcome, len(targets))
	for _, target := range targets {
		target := target
		task := scanTask{
			domainID: target.DomainID,
			result:   results,
			onStart: func() {
				job.appendEvent(CheckEvent{
					Type:     "domain.started",
					DomainID: target.DomainID,
					Hostname: target.Hostname,
					Status:   "running",
				})
			},
		}
		select {
		case <-ctx.Done():
			job.finishInterrupted(ctx.Err())
			return
		case jobs <- task:
		}
	}

	for index := 0; index < len(targets); index++ {
		select {
		case <-ctx.Done():
			job.finishInterrupted(ctx.Err())
			return
		case outcome := <-results:
			job.completeDomain(outcome)
		}
	}
	job.finish()

}

func (s *Service) expireCheckJob(job *checkJob) {
	time.AfterFunc(checkJobRetention, func() {
		s.checkJobsMu.Lock()
		if s.checkJobs[job.id] == job {
			delete(s.checkJobs, job.id)
		}
		s.checkJobsMu.Unlock()
	})
}

func (job *checkJob) appendEvent(event CheckEvent) {
	job.mu.Lock()
	defer job.mu.Unlock()
	job.appendEventLocked(event)
}

func (job *checkJob) appendEventLocked(event CheckEvent) {
	event.ID = int64(len(job.events) + 1)
	event.JobID = job.id
	event.Mode = job.mode
	event.Total = job.total
	event.Completed = job.completed
	event.Succeeded = job.succeeded
	event.Failed = job.failed
	job.events = append(job.events, event)
	close(job.signal)
	job.signal = make(chan struct{})
}

func (job *checkJob) completeDomain(outcome scanOutcome) {
	job.mu.Lock()
	defer job.mu.Unlock()

	job.completed++
	event := CheckEvent{Type: "domain.completed", Status: string(models.DomainStatusError)}
	if outcome.domain != nil {
		event.DomainID = outcome.domain.ID
		event.Hostname = outcome.domain.Hostname
		event.Status = string(outcome.domain.Status)
		event.Error = outcome.domain.LastError
	}
	if outcome.err != nil {
		event.Error = outcome.err.Error()
	}
	if outcome.err == nil && outcome.domain != nil && outcome.domain.Status == models.DomainStatusHealthy {
		job.succeeded++
	} else {
		job.failed++
		if event.Error == "" {
			event.Error = "certificate check failed"
		}
	}
	job.appendEventLocked(event)
}

func (job *checkJob) finish() {
	job.mu.Lock()
	defer job.mu.Unlock()
	if job.done {
		return
	}
	job.done = true
	status := "completed"
	if job.failed == job.total {
		status = "failed"
	} else if job.failed > 0 {
		status = "partial"
	}
	job.appendEventLocked(CheckEvent{Type: "job.completed", Status: status})
}

func (job *checkJob) finishInterrupted(err error) {
	job.mu.Lock()
	defer job.mu.Unlock()
	if job.done {
		return
	}
	job.failed += job.total - job.completed
	job.completed = job.total
	job.done = true
	job.appendEventLocked(CheckEvent{Type: "job.completed", Status: "failed", Error: err.Error()})
}

func (job *checkJob) snapshot(afterID int64) ([]CheckEvent, bool, <-chan struct{}, error) {
	job.mu.Lock()
	defer job.mu.Unlock()

	start := 0
	if afterID > 0 && afterID < int64(len(job.events)) {
		start = int(afterID)
	} else if afterID >= int64(len(job.events)) {
		start = len(job.events)
	}
	events := append([]CheckEvent(nil), job.events[start:]...)
	return events, job.done, job.signal, nil
}

func newCheckJobID() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}
