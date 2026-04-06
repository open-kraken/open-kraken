package http

import (
	"testing"
	"time"
)

func TestRateLimiterAllow(t *testing.T) {
	rl := NewRateLimiter(5, 5, time.Second)

	// First 5 requests should be allowed.
	for i := 0; i < 5; i++ {
		if !rl.allow("192.168.1.1") {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}

	// 6th request should be denied.
	if rl.allow("192.168.1.1") {
		t.Fatal("6th request should be denied")
	}

	// Different IP should still be allowed.
	if !rl.allow("192.168.1.2") {
		t.Fatal("different IP should be allowed")
	}
}

func TestRateLimiterRefill(t *testing.T) {
	rl := NewRateLimiter(10, 10, 50*time.Millisecond)

	// Exhaust the bucket.
	for i := 0; i < 10; i++ {
		rl.allow("10.0.0.1")
	}
	if rl.allow("10.0.0.1") {
		t.Fatal("should be rate limited")
	}

	// Wait for refill.
	time.Sleep(100 * time.Millisecond)

	if !rl.allow("10.0.0.1") {
		t.Fatal("should be allowed after refill")
	}
}
