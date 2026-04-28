package handlers

import (
	"crypto/sha1"
	"fmt"
	"strings"
)

const aelIDNamespace = "open-kraken:ael-id:v1:"

func normalizeAELID(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	if isUUID(value) {
		return strings.ToLower(value)
	}
	sum := sha1.Sum([]byte(aelIDNamespace + value))
	sum[6] = (sum[6] & 0x0f) | 0x50
	sum[8] = (sum[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", sum[0:4], sum[4:6], sum[6:8], sum[8:10], sum[10:16])
}

func isUUID(value string) bool {
	if len(value) != 36 {
		return false
	}
	for i, ch := range value {
		switch i {
		case 8, 13, 18, 23:
			if ch != '-' {
				return false
			}
		default:
			if !((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')) {
				return false
			}
		}
	}
	return true
}
