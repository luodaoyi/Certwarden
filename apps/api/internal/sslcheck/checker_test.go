package sslcheck

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestCheckTLSCertificate(t *testing.T) {
	server := httptest.NewTLSServer(nil)
	defer server.Close()

	hostPort := strings.TrimPrefix(server.URL, "https://")
	parts := strings.Split(hostPort, ":")
	if len(parts) != 2 {
		t.Fatalf("unexpected test server url %q", server.URL)
	}

	checker := New(3 * time.Second)
	checker.TLSConfig = &tls.Config{
		InsecureSkipVerify: true,
	}
	result := checker.Check(context.Background(), parts[0], mustParsePort(t, parts[1]), "")

	if result.Status != "healthy" {
		t.Fatalf("expected healthy result, got %#v", result)
	}
	if result.CertExpiresAt == nil {
		t.Fatalf("expected certificate expiry")
	}
	if result.CertValidFrom == nil {
		t.Fatalf("expected certificate validity start")
	}
	if result.ResolvedIP == "" {
		t.Fatalf("expected resolved ip")
	}
	if result.CertFingerprintSHA256 == "" {
		t.Fatalf("expected certificate fingerprint")
	}
}

func TestCheckTLSCertificateWithTargetIP(t *testing.T) {
	server := httptest.NewTLSServer(nil)
	defer server.Close()

	hostPort := strings.TrimPrefix(server.URL, "https://")
	parts := strings.Split(hostPort, ":")
	if len(parts) != 2 {
		t.Fatalf("unexpected test server url %q", server.URL)
	}

	checker := New(3 * time.Second)
	checker.TLSConfig = &tls.Config{
		InsecureSkipVerify: true,
	}
	result := checker.Check(context.Background(), "example.com", mustParsePort(t, parts[1]), parts[0])

	if result.Status != "healthy" {
		t.Fatalf("expected healthy result, got %#v", result)
	}
	if result.ResolvedIP != parts[0] {
		t.Fatalf("expected resolved ip %q, got %q", parts[0], result.ResolvedIP)
	}
}

func TestCheckExpiredTLSCertificateReturnsCertificateDetails(t *testing.T) {
	server := httptest.NewTLSServer(nil)
	defer server.Close()

	hostPort := strings.TrimPrefix(server.URL, "https://")
	parts := strings.Split(hostPort, ":")
	if len(parts) != 2 {
		t.Fatalf("unexpected test server url %q", server.URL)
	}

	certificate := server.Certificate()
	roots := x509.NewCertPool()
	roots.AddCert(certificate)
	checker := New(3 * time.Second)
	checker.TLSConfig = &tls.Config{RootCAs: roots}
	checker.Now = func() time.Time {
		return certificate.NotAfter.Add(time.Hour)
	}

	result := checker.Check(context.Background(), parts[0], mustParsePort(t, parts[1]), "")

	if result.Status != "error" {
		t.Fatalf("expected error result, got %#v", result)
	}
	if !strings.Contains(result.Error, "certificate has expired") {
		t.Fatalf("expected certificate expiry error, got %q", result.Error)
	}
	if result.CertExpiresAt == nil || !result.CertExpiresAt.Equal(certificate.NotAfter) {
		t.Fatalf("expected expired certificate details, got %#v", result.CertExpiresAt)
	}
	if result.DaysRemaining == nil || *result.DaysRemaining != -1 {
		t.Fatalf("expected -1 day remaining, got %#v", result.DaysRemaining)
	}
}

func TestCheckRetriesRetryableDialErrors(t *testing.T) {
	server := httptest.NewTLSServer(nil)
	defer server.Close()

	hostPort := strings.TrimPrefix(server.URL, "https://")
	parts := strings.Split(hostPort, ":")
	if len(parts) != 2 {
		t.Fatalf("unexpected test server url %q", server.URL)
	}

	checker := New(3 * time.Second)
	checker.RetryBaseDelay = 0
	checker.TLSConfig = &tls.Config{InsecureSkipVerify: true}
	var attempts atomic.Int32
	checker.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		if attempts.Add(1) < 3 {
			return nil, errors.New("temporary dial failure")
		}
		return (&net.Dialer{}).DialContext(ctx, network, address)
	}

	result := checker.Check(context.Background(), parts[0], mustParsePort(t, parts[1]), "")

	if result.Status != "healthy" {
		t.Fatalf("expected retry to recover, got %#v", result)
	}
	if attempts.Load() != 3 {
		t.Fatalf("expected 3 dial attempts, got %d", attempts.Load())
	}
}

func TestCheckReportsAllFailedAttemptsAsRetryable(t *testing.T) {
	checker := New(time.Second)
	checker.RetryBaseDelay = 0
	checker.DialContext = func(context.Context, string, string) (net.Conn, error) {
		return nil, errors.New("dial timeout")
	}

	result := checker.Check(context.Background(), "example.com", 443, "192.0.2.1")

	if !result.Retryable {
		t.Fatalf("expected network failure to be retryable, got %#v", result)
	}
	if !strings.Contains(result.Error, "all 3 attempts failed") {
		t.Fatalf("expected aggregated retry error, got %q", result.Error)
	}
}

func mustParsePort(t *testing.T, raw string) int {
	t.Helper()
	var port int
	_, err := fmt.Sscanf(raw, "%d", &port)
	if err != nil {
		t.Fatalf("parse port: %v", err)
	}
	return port
}
