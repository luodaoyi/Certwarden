package sslcheck

import (
	"context"
	"fmt"
	"net/http/httptest"
	"strings"
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
	result := checker.Check(context.Background(), parts[0], mustParsePort(t, parts[1]))

	if result.Status != "healthy" {
		t.Fatalf("expected healthy result, got %#v", result)
	}
	if result.CertExpiresAt == nil {
		t.Fatalf("expected certificate expiry")
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
