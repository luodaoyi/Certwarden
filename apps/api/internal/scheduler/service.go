package scheduler

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/luodaoyi/Certwarden/apps/api/internal/config"
	"github.com/luodaoyi/Certwarden/apps/api/internal/crashlog"
	"github.com/luodaoyi/Certwarden/apps/api/internal/models"
	"github.com/luodaoyi/Certwarden/apps/api/internal/notify"
	"github.com/luodaoyi/Certwarden/apps/api/internal/sslcheck"

	"gorm.io/gorm"
)

type Service struct {
	db          *gorm.DB
	cfg         config.Config
	checker     *sslcheck.Checker
	notifier    *notify.Service
	logger      *slog.Logger
	jobs        chan uint
	cancel      context.CancelFunc
	startOnce   sync.Once
	stopOnce    sync.Once
	workerGroup sync.WaitGroup
	loopGroup   sync.WaitGroup
	now         func() time.Time
}

func NewService(db *gorm.DB, cfg config.Config, checker *sslcheck.Checker, notifier *notify.Service, logger *slog.Logger) *Service {
	return &Service{
		db:       db,
		cfg:      cfg,
		checker:  checker,
		notifier: notifier,
		logger:   logger,
		now: func() time.Time {
			return time.Now().UTC()
		},
	}
}

func (s *Service) Start(ctx context.Context) {
	s.startOnce.Do(func() {
		runCtx, cancel := context.WithCancel(ctx)
		s.cancel = cancel
		s.jobs = make(chan uint, s.cfg.ScanConcurrency*2)

		for index := 0; index < s.cfg.ScanConcurrency; index++ {
			s.workerGroup.Add(1)
			workerIndex := index
			go func() {
				defer func() {
					if recovered := recover(); recovered != nil {
						crashlog.Log(s.logger, "scheduler worker panicked", recovered, "worker", workerIndex)
						panic(recovered)
					}
				}()
				s.worker(runCtx, workerIndex)
			}()
		}

		s.loopGroup.Add(1)
		go func() {
			defer func() {
				if recovered := recover(); recovered != nil {
					crashlog.Log(s.logger, "scheduler loop panicked", recovered)
					panic(recovered)
				}
			}()
			s.loop(runCtx)
		}()
	})
}

func (s *Service) Stop() {
	s.stopOnce.Do(func() {
		if s.cancel != nil {
			s.cancel()
		}
		s.loopGroup.Wait()
		// Workers exit on ctx.Done(), so keep the channel open here.
		// Closing it races with the async enqueue goroutine below and can
		// trigger `panic: send on closed channel` during shutdown.
		s.workerGroup.Wait()
	})
}

func (s *Service) CheckDomainNow(ctx context.Context, domainID uint) (*models.Domain, error) {
	return s.processDomain(ctx, domainID)
}

func (s *Service) loop(ctx context.Context) {
	defer s.loopGroup.Done()

	ticker := time.NewTicker(s.cfg.ScanInterval)
	defer ticker.Stop()

	if err := s.dispatchDueDomains(ctx); err != nil {
		s.logger.Error("initial domain dispatch failed", "error", err)
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.dispatchDueDomains(ctx); err != nil {
				s.logger.Error("dispatch due domains", "error", err)
			}
		}
	}
}

func (s *Service) worker(ctx context.Context, index int) {
	defer s.workerGroup.Done()

	for {
		select {
		case <-ctx.Done():
			return
		case domainID, ok := <-s.jobs:
			if !ok {
				return
			}
			if _, err := s.processDomain(ctx, domainID); err != nil {
				s.logger.Error("process domain", "worker", index, "domain_id", domainID, "error", err)
			}
		}
	}
}

func (s *Service) dispatchDueDomains(ctx context.Context) error {
	now := s.now()

	var domains []models.Domain
	if err := s.db.WithContext(ctx).
		Table("domains").
		Joins("JOIN tenants ON tenants.id = domains.tenant_id").
		Where("domains.enabled = ? AND domains.next_check_at <= ? AND tenants.disabled = ?", true, now, false).
		Order("domains.next_check_at ASC").
		Limit(s.cfg.ScanConcurrency * 4).
		Find(&domains).Error; err != nil {
		return err
	}

	for _, domain := range domains {
		claimedUntil := now.Add(time.Duration(domain.CheckIntervalSeconds) * time.Second)
		result := s.db.WithContext(ctx).Model(&models.Domain{}).
			Where("id = ? AND next_check_at <= ?", domain.ID, now).
			Update("next_check_at", claimedUntil)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			continue
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case s.jobs <- domain.ID:
		default:
			go func(id uint) {
				defer func() {
					if recovered := recover(); recovered != nil {
						crashlog.Log(s.logger, "scheduler enqueue goroutine panicked", recovered, "domain_id", id)
						panic(recovered)
					}
				}()

				select {
				case <-ctx.Done():
				case s.jobs <- id:
				}
			}(domain.ID)
		}
	}

	return nil
}

func (s *Service) processDomain(ctx context.Context, domainID uint) (*models.Domain, error) {
	var domain models.Domain
	if err := s.db.WithContext(ctx).First(&domain, domainID).Error; err != nil {
		return nil, err
	}

	if !domain.Enabled {
		return &domain, nil
	}

	var tenant models.Tenant
	if err := s.db.WithContext(ctx).Select("id", "disabled").First(&tenant, domain.TenantID).Error; err != nil {
		return nil, err
	}
	if tenant.Disabled {
		return &domain, nil
	}

	previousStatus := domain.Status
	previousDays := cloneIntPtr(domain.DaysRemaining)

	result := s.checker.Check(ctx, domain.Hostname, domain.Port, domain.TargetIP)
	nextCheckAt := s.now().Add(resolveInterval(domain, s.cfg.ScanInterval))

	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		checkResult := models.DomainCheckResult{
			DomainID:               domain.ID,
			TenantID:               domain.TenantID,
			Status:                 result.Status,
			ErrorMessage:           result.Error,
			ResolvedIP:             result.ResolvedIP,
			CertValidFrom:          result.CertValidFrom,
			CertExpiresAt:          result.CertExpiresAt,
			DaysRemaining:          cloneIntPtr(result.DaysRemaining),
			CertIssuer:             result.CertIssuer,
			CertSubject:            result.CertSubject,
			CertCommonName:         result.CertCommonName,
			CertSerialNumber:       result.CertSerialNumber,
			CertFingerprintSHA256:  result.CertFingerprintSHA256,
			CertSignatureAlgorithm: result.CertSignatureAlgorithm,
			CheckedAt:              result.CheckedAt,
		}
		if err := checkResult.SetCertDNSNames(result.CertDNSNames); err != nil {
			return err
		}
		if err := tx.Create(&checkResult).Error; err != nil {
			return err
		}

		updates := map[string]any{
			"status":          result.Status,
			"last_checked_at": result.CheckedAt,
			"next_check_at":   nextCheckAt,
			"updated_at":      s.now(),
		}
		if result.ResolvedIP != "" {
			updates["resolved_ip"] = result.ResolvedIP
		}
		if result.Status == models.DomainStatusHealthy {
			updates["cert_valid_from"] = result.CertValidFrom
			updates["cert_expires_at"] = result.CertExpiresAt
			updates["days_remaining"] = result.DaysRemaining
			updates["cert_issuer"] = result.CertIssuer
			updates["cert_subject"] = result.CertSubject
			updates["cert_common_name"] = result.CertCommonName
			updates["cert_dns_names_json"] = checkResult.CertDNSNamesJSON
			updates["cert_serial_number"] = result.CertSerialNumber
			updates["cert_fingerprint_sha256"] = result.CertFingerprintSHA256
			updates["cert_signature_algorithm"] = result.CertSignatureAlgorithm
			updates["last_error"] = ""
			updates["last_successful_at"] = result.CheckedAt
		} else {
			updates["last_error"] = result.Error
		}
		return tx.Model(&models.Domain{}).Where("id = ?", domain.ID).Updates(updates).Error
	}); err != nil {
		return nil, err
	}

	if err := s.db.WithContext(ctx).First(&domain, domainID).Error; err != nil {
		return nil, err
	}

	if err := s.notifier.MaybeNotify(ctx, domain, previousStatus, previousDays); err != nil {
		s.logger.Error("maybe notify", "domain_id", domain.ID, "error", err)
	}

	return &domain, nil
}

func resolveInterval(domain models.Domain, fallback time.Duration) time.Duration {
	if domain.CheckIntervalSeconds > 0 {
		return time.Duration(domain.CheckIntervalSeconds) * time.Second
	}
	return fallback
}

func cloneIntPtr(value *int) *int {
	if value == nil {
		return nil
	}
	copied := *value
	return &copied
}

func (s *Service) ForceDue(ctx context.Context, domainID uint) error {
	result := s.db.WithContext(ctx).Model(&models.Domain{}).Where("id = ?", domainID).Update("next_check_at", s.now())
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("domain not found")
	}
	return nil
}
