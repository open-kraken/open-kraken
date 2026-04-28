package handlers

import "testing"

func TestNormalizeAELIDAcceptsUUIDAndStableAliases(t *testing.T) {
	uuid := "550e8400-e29b-41d4-a716-446655440000"
	if got := normalizeAELID(uuid); got != uuid {
		t.Fatalf("expected uuid unchanged, got %q", got)
	}
	first := normalizeAELID("default")
	second := normalizeAELID("default")
	if first == "" || first != second {
		t.Fatalf("expected stable generated uuid, got %q and %q", first, second)
	}
	if !isUUID(first) {
		t.Fatalf("expected generated value to be uuid-shaped, got %q", first)
	}
	if other := normalizeAELID("team-core"); other == first {
		t.Fatalf("expected different aliases to produce different ids")
	}
}
