package scheduler

import (
	"testing"
	"time"

	"go-check-ssl/apps/api/internal/models"
)

func TestResolveIntervalUsesDomainOverride(t *testing.T) {
	domain := models.Domain{CheckIntervalSeconds: 120}
	if got := resolveInterval(domain, time.Hour); got != 120*time.Second {
		t.Fatalf("expected 120s, got %s", got)
	}
}
