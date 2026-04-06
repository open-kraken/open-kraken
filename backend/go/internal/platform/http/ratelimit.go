package http

import (
	"net/http"
	"sync"
	"time"
)

// RateLimiter implements a per-IP token bucket rate limiter.
type RateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*bucket
	rate     int           // tokens added per interval
	burst    int           // max bucket size
	interval time.Duration // refill interval
}

type bucket struct {
	tokens    int
	lastCheck time.Time
}

// NewRateLimiter creates a rate limiter that allows `rate` requests per `interval`
// with a maximum burst size.
func NewRateLimiter(rate, burst int, interval time.Duration) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*bucket),
		rate:     rate,
		burst:    burst,
		interval: interval,
	}
	go rl.cleanup()
	return rl
}

func (rl *RateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	b, ok := rl.visitors[ip]
	if !ok {
		rl.visitors[ip] = &bucket{tokens: rl.burst - 1, lastCheck: time.Now()}
		return true
	}

	elapsed := time.Since(b.lastCheck)
	refills := int(elapsed / rl.interval) * rl.rate
	b.tokens += refills
	if b.tokens > rl.burst {
		b.tokens = rl.burst
	}
	b.lastCheck = time.Now()

	if b.tokens <= 0 {
		return false
	}
	b.tokens--
	return true
}

func (rl *RateLimiter) cleanup() {
	for {
		time.Sleep(5 * time.Minute)
		rl.mu.Lock()
		cutoff := time.Now().Add(-10 * time.Minute)
		for ip, b := range rl.visitors {
			if b.lastCheck.Before(cutoff) {
				delete(rl.visitors, ip)
			}
		}
		rl.mu.Unlock()
	}
}

// WithRateLimit wraps an http.Handler with per-IP rate limiting.
func WithRateLimit(limiter *RateLimiter, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := clientIP(r)
		if !limiter.allow(ip) {
			w.Header().Set("Retry-After", "1")
			http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func clientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		// Use the first IP in the chain.
		for i := 0; i < len(forwarded); i++ {
			if forwarded[i] == ',' {
				return forwarded[:i]
			}
		}
		return forwarded
	}
	if real := r.Header.Get("X-Real-Ip"); real != "" {
		return real
	}
	// Strip port from RemoteAddr.
	addr := r.RemoteAddr
	for i := len(addr) - 1; i >= 0; i-- {
		if addr[i] == ':' {
			return addr[:i]
		}
	}
	return addr
}
