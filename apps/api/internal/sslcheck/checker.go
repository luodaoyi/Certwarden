package sslcheck

import (
	"context"
	"crypto/tls"
	"fmt"
	"math"
	"net"
	"strconv"
	"time"

	"github.com/luodaoyi/Certwarden/apps/api/internal/models"
)

type Result struct {
	Status        models.DomainStatus
	CheckedAt     time.Time
	CertExpiresAt *time.Time
	DaysRemaining *int
	Error         string
}

type Checker struct {
	Timeout   time.Duration
	TLSConfig *tls.Config
	Now       func() time.Time
}

func New(timeout time.Duration) *Checker {
	return &Checker{
		Timeout: timeout,
		Now: func() time.Time {
			return time.Now().UTC()
		},
	}
}

func (c *Checker) Check(ctx context.Context, hostname string, port int) Result {
	now := c.Now()
	addr := net.JoinHostPort(hostname, strconv.Itoa(port))

	dialer := &net.Dialer{Timeout: c.Timeout}
	tlsConfig := &tls.Config{
		ServerName: hostname,
		MinVersion: tls.VersionTLS12,
	}
	if c.TLSConfig != nil {
		tlsConfig = c.TLSConfig.Clone()
		if tlsConfig.ServerName == "" {
			tlsConfig.ServerName = hostname
		}
		if tlsConfig.MinVersion == 0 {
			tlsConfig.MinVersion = tls.VersionTLS12
		}
	}

	conn, err := tls.DialWithDialer(dialer, "tcp", addr, tlsConfig)
	if err != nil {
		return Result{
			Status:    models.DomainStatusError,
			CheckedAt: now,
			Error:     err.Error(),
		}
	}
	defer conn.Close()

	if err := conn.HandshakeContext(ctx); err != nil {
		return Result{
			Status:    models.DomainStatusError,
			CheckedAt: now,
			Error:     err.Error(),
		}
	}

	certs := conn.ConnectionState().PeerCertificates
	if len(certs) == 0 {
		return Result{
			Status:    models.DomainStatusError,
			CheckedAt: now,
			Error:     "no peer certificates received",
		}
	}

	expiresAt := certs[0].NotAfter.UTC()
	daysRemaining := int(math.Floor(expiresAt.Sub(now).Hours() / 24))

	return Result{
		Status:        models.DomainStatusHealthy,
		CheckedAt:     now,
		CertExpiresAt: &expiresAt,
		DaysRemaining: &daysRemaining,
	}
}

func (r Result) MustHealthy() error {
	if r.Status == models.DomainStatusHealthy {
		return nil
	}
	return fmt.Errorf("%s", r.Error)
}
