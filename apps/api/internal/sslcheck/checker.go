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

func (c *Checker) Check(ctx context.Context, hostname string, port int, targetIP string) Result {
	now := c.Now()

	resolvedIP, err := resolveAddress(ctx, hostname, targetIP)
	if err != nil {
		return Result{
			Status:     models.DomainStatusError,
			CheckedAt:  now,
			ResolvedIP: resolvedIP,
			Error:      err.Error(),
		}
	}

	addr := net.JoinHostPort(resolvedIP, strconv.Itoa(port))

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
	verifyCertificate := !tlsConfig.InsecureSkipVerify
	// Finish the handshake so expired or otherwise invalid certificates can still be inspected.
	tlsConfig.InsecureSkipVerify = true

	rawConn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return Result{
			Status:     models.DomainStatusError,
			CheckedAt:  now,
			ResolvedIP: resolvedIP,
			Error:      err.Error(),
		}
	}
	conn := tls.Client(rawConn, tlsConfig)
	defer conn.Close()

	if err := conn.HandshakeContext(ctx); err != nil {
		return Result{
			Status:     models.DomainStatusError,
			CheckedAt:  now,
			ResolvedIP: resolvedIP,
			Error:      err.Error(),
		}
	}

	certs := conn.ConnectionState().PeerCertificates
	if len(certs) == 0 {
		return Result{
			Status:     models.DomainStatusError,
			CheckedAt:  now,
			ResolvedIP: resolvedIP,
			Error:      "no peer certificates received",
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

func (r Result) MustHealthy() error {
	if r.Status == models.DomainStatusHealthy {
		return nil
	}
	return fmt.Errorf("%s", r.Error)
}

func resolveAddress(ctx context.Context, hostname string, targetIP string) (string, error) {
	trimmedTarget := strings.TrimSpace(targetIP)
	if trimmedTarget != "" {
		parsed := net.ParseIP(trimmedTarget)
		if parsed == nil {
			return "", fmt.Errorf("target ip must be a valid IPv4 or IPv6 address")
		}
		return parsed.String(), nil
	}

	if parsed := net.ParseIP(strings.TrimSpace(hostname)); parsed != nil {
		return parsed.String(), nil
	}

	records, err := net.DefaultResolver.LookupIPAddr(ctx, hostname)
	if err != nil {
		return "", fmt.Errorf("resolve hostname: %w", err)
	}
	if len(records) == 0 {
		return "", fmt.Errorf("no ip address resolved for hostname")
	}

	for _, record := range records {
		if ipv4 := record.IP.To4(); ipv4 != nil {
			return ipv4.String(), nil
		}
	}

	return records[0].IP.String(), nil
}
