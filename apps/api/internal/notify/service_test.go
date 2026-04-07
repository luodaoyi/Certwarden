package notify

import (
	"testing"

	"github.com/luodaoyi/Certwarden/apps/api/internal/models"
)

func TestComputeThresholdCrossings(t *testing.T) {
	previous := 40
	got := computeThresholdCrossings(&previous, 5, []int{30, 7, 1})
	if len(got) != 2 || got[0] != 7 && got[0] != 30 {
		t.Fatalf("expected threshold crossings, got %#v", got)
	}
}

func TestComputeEventsIncludesRecovered(t *testing.T) {
	current := 12
	domain := models.Domain{
		Status:        models.DomainStatusHealthy,
		DaysRemaining: &current,
	}
	events := computeEvents(models.DomainStatusError, nil, domain, []int{30, 7, 1})
	if len(events) == 0 {
		t.Fatalf("expected at least one event")
	}
	foundRecovered := false
	for _, event := range events {
		if event.Type == EventRecovered {
			foundRecovered = true
		}
	}
	if !foundRecovered {
		t.Fatalf("expected recovered event, got %#v", events)
	}
}
