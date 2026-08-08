package sslcheck

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"fmt"
	"math"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/luodaoyi/Certwarden/apps/api/internal/models"
)

type Result struct {
	Status                 models.DomainStatus
	CheckedAt              time.Time
	ResolvedIP             string
	CertValidFrom          *time.Time
	CertExpiresAt          *time.Time
	DaysRemaining          *int
	CertIssuer             string
	CertSubject            string
	CertCommonName         string
	CertDNSNames           []string
	CertSerialNumber       string
	CertFingerprintSHA256  string
	CertSignatureAlgorithm string
	Error                  string
	Retryable              bool
}

type Checker struct {
	Timeout        time.Duration
	Attempts       int
	RetryBaseDelay time.Duration
	TLSConfig      *tls.Config
	DialContext    func(context.Context, string, string) (net.Conn, error)
	Now            func() time.Time
}

func New(timeout time.Duration) *Checker {
	return &Checker{
		Timeout:        timeout,
		Attempts:       3,
		RetryBaseDelay: 500 * time.Millisecond,
		Now: func() time.Time {
			return time.Now().UTC()
		},
	}
}

func (c *Checker) Check(ctx context.Context, hostname string, port int, targetIP string) Result {
	trimmedTarget := strings.TrimSpace(targetIP)
	if trimmedTarget != "" && net.ParseIP(trimmedTarget) == nil {
		return Result{
			Status:    models.DomainStatusError,
			CheckedAt: c.Now(),
			Error:     "target ip must be a valid IPv4 or IPv6 address",
		}
	}

	attempts := c.Attempts
	if attempts < 1 {
		attempts = 1
	}

	errors := make([]string, 0, attempts)
	var lastResult Result
	for attempt := 0; attempt < attempts; attempt++ {
		if attempt > 0 {
			if err := waitForRetry(ctx, c.retryDelay(attempt)); err != nil {
				lastResult.Error = fmt.Sprintf("%s; retry canceled: %v", lastResult.Error, err)
				return lastResult
			}
		}

		result := c.checkOnce(ctx, hostname, port, targetIP, attempt)
		if result.Status == models.DomainStatusHealthy || !result.Retryable {
			return result
		}

		lastResult = result
		errors = append(errors, fmt.Sprintf("attempt %d: %s", attempt+1, result.Error))
	}

	lastResult.Error = fmt.Sprintf("all %d attempts failed: %s", attempts, strings.Join(errors, "; "))
	return lastResult
}

func (c *Checker) checkOnce(ctx context.Context, hostname string, port int, targetIP string, attempt int) Result {
	now := c.Now()
	attemptCtx, cancel := context.WithCancel(ctx)
	if c.Timeout > 0 {
		attemptCtx, cancel = context.WithTimeout(ctx, c.Timeout)
	}
	defer cancel()

	resolvedIPs, err := resolveAddresses(attemptCtx, hostname, targetIP)
	if err != nil {
		return Result{
			Status:    models.DomainStatusError,
			CheckedAt: now,
			Error:     err.Error(),
			Retryable: true,
		}
	}
	resolvedIP := resolvedIPs[attempt%len(resolvedIPs)]

	addr := net.JoinHostPort(resolvedIP, strconv.Itoa(port))

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
	verifyCertificate := !tlsConfig.InsecureSkipVerify
	// Finish the handshake so expired or otherwise invalid certificates can still be inspected.
	tlsConfig.InsecureSkipVerify = true

	dialContext := c.DialContext
	if dialContext == nil {
		dialer := &net.Dialer{}
		dialContext = dialer.DialContext
	}
	rawConn, err := dialContext(attemptCtx, "tcp", addr)
	if err != nil {
		return Result{
			Status:     models.DomainStatusError,
			CheckedAt:  now,
			ResolvedIP: resolvedIP,
			Error:      err.Error(),
			Retryable:  true,
		}
	}
	conn := tls.Client(rawConn, tlsConfig)
	defer conn.Close()

	if err := conn.HandshakeContext(attemptCtx); err != nil {
		return Result{
			Status:     models.DomainStatusError,
			CheckedAt:  now,
			ResolvedIP: resolvedIP,
			Error:      err.Error(),
			Retryable:  true,
		}
	}

	certs := conn.ConnectionState().PeerCertificates
	if len(certs) == 0 {
		return Result{
			Status:     models.DomainStatusError,
			CheckedAt:  now,
			ResolvedIP: resolvedIP,
			Error:      "no peer certificates received",
			Retryable:  true,
		}
	}

	leaf := certs[0]
	validFrom := leaf.NotBefore.UTC()
	expiresAt := leaf.NotAfter.UTC()
	daysRemaining := int(math.Floor(expiresAt.Sub(now).Hours() / 24))
	fingerprint := sha256.Sum256(leaf.Raw)

	result := Result{
		Status:                 models.DomainStatusHealthy,
		CheckedAt:              now,
		ResolvedIP:             resolvedIP,
		CertValidFrom:          &validFrom,
		CertExpiresAt:          &expiresAt,
		DaysRemaining:          &daysRemaining,
		CertIssuer:             leaf.Issuer.String(),
		CertSubject:            leaf.Subject.String(),
		CertCommonName:         strings.TrimSpace(leaf.Subject.CommonName),
		CertDNSNames:           append([]string(nil), leaf.DNSNames...),
		CertSerialNumber:       strings.ToUpper(leaf.SerialNumber.Text(16)),
		CertFingerprintSHA256:  strings.ToUpper(hex.EncodeToString(fingerprint[:])),
		CertSignatureAlgorithm: leaf.SignatureAlgorithm.String(),
	}
	if verifyCertificate {
		intermediates := x509.NewCertPool()
		for _, certificate := range certs[1:] {
			intermediates.AddCert(certificate)
		}
		if _, err := leaf.Verify(x509.VerifyOptions{
			DNSName:       tlsConfig.ServerName,
			Roots:         tlsConfig.RootCAs,
			Intermediates: intermediates,
			CurrentTime:   now,
		}); err != nil {
			result.Status = models.DomainStatusError
			result.Error = fmt.Sprintf("tls: failed to verify certificate: %v", err)
		}
	}

	return result
}

func (c *Checker) retryDelay(retry int) time.Duration {
	if c.RetryBaseDelay <= 0 || retry <= 0 {
		return 0
	}
	return c.RetryBaseDelay * time.Duration(1<<(retry-1))
}

func waitForRetry(ctx context.Context, delay time.Duration) error {
	if delay <= 0 {
		return ctx.Err()
	}

	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (r Result) MustHealthy() error {
	if r.Status == models.DomainStatusHealthy {
		return nil
	}
	return fmt.Errorf("%s", r.Error)
}

func resolveAddresses(ctx context.Context, hostname string, targetIP string) ([]string, error) {
	trimmedTarget := strings.TrimSpace(targetIP)
	if trimmedTarget != "" {
		parsed := net.ParseIP(trimmedTarget)
		if parsed == nil {
			return nil, fmt.Errorf("target ip must be a valid IPv4 or IPv6 address")
		}
		return []string{parsed.String()}, nil
	}

	if parsed := net.ParseIP(strings.TrimSpace(hostname)); parsed != nil {
		return []string{parsed.String()}, nil
	}

	records, err := net.DefaultResolver.LookupIPAddr(ctx, hostname)
	if err != nil {
		return nil, fmt.Errorf("resolve hostname: %w", err)
	}
	if len(records) == 0 {
		return nil, fmt.Errorf("no ip address resolved for hostname")
	}

	addresses := make([]string, 0, len(records))
	seen := make(map[string]struct{}, len(records))
	for _, record := range records {
		if ipv4 := record.IP.To4(); ipv4 != nil {
			address := ipv4.String()
			if _, exists := seen[address]; !exists {
				seen[address] = struct{}{}
				addresses = append(addresses, address)
			}
		}
	}
	for _, record := range records {
		if record.IP.To4() != nil {
			continue
		}
		address := record.IP.String()
		if _, exists := seen[address]; !exists {
			seen[address] = struct{}{}
			addresses = append(addresses, address)
		}
	}

	return addresses, nil
}

func resolveAddress(ctx context.Context, hostname string, targetIP string) (string, error) {
	addresses, err := resolveAddresses(ctx, hostname, targetIP)
	if err != nil {
		return "", err
	}
	return addresses[0], nil
}
