package account

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"open-kraken/backend/go/internal/authz"
)

var ErrNotFound = errors.New("account: not found")
var ErrInvalid = errors.New("account: invalid")

type SeedAccount struct {
	MemberID    string
	WorkspaceID string
	DisplayName string
	Role        authz.Role
	Password    string
	Avatar      string
}

type Account struct {
	MemberID     string     `json:"memberId"`
	WorkspaceID  string     `json:"workspaceId"`
	DisplayName  string     `json:"displayName"`
	Role         authz.Role `json:"role"`
	Avatar       string     `json:"avatar"`
	PasswordHash string     `json:"passwordHash,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

type PublicAccount struct {
	MemberID    string     `json:"memberId"`
	WorkspaceID string     `json:"workspaceId"`
	DisplayName string     `json:"displayName"`
	Role        authz.Role `json:"role"`
	Avatar      string     `json:"avatar"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

type Service struct {
	mu   sync.RWMutex
	path string
}

func NewService(dataDir string, seeds []SeedAccount) (*Service, error) {
	if strings.TrimSpace(dataDir) == "" {
		return nil, fmt.Errorf("%w: dataDir is required", ErrInvalid)
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, err
	}
	s := &Service{path: filepath.Join(dataDir, "accounts.json")}
	if err := s.seed(seeds); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Service) List() ([]PublicAccount, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	accounts, err := s.readLocked()
	if err != nil {
		return nil, err
	}
	out := make([]PublicAccount, 0, len(accounts))
	for _, account := range accounts {
		out = append(out, public(account))
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Role == out[j].Role {
			return out[i].MemberID < out[j].MemberID
		}
		return roleRank(out[i].Role) > roleRank(out[j].Role)
	})
	return out, nil
}

func (s *Service) Get(memberID string) (Account, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	accounts, err := s.readLocked()
	if err != nil {
		return Account{}, err
	}
	for _, account := range accounts {
		if account.MemberID == memberID {
			return account, nil
		}
	}
	return Account{}, ErrNotFound
}

func (s *Service) Authenticate(memberID, password string) (Account, bool, error) {
	account, err := s.Get(strings.TrimSpace(memberID))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return Account{}, false, nil
		}
		return Account{}, false, err
	}
	if !verifyPassword(account.PasswordHash, password) {
		return Account{}, false, nil
	}
	return account, true, nil
}

func (s *Service) Create(input SeedAccount) (PublicAccount, error) {
	input.MemberID = strings.TrimSpace(input.MemberID)
	input.WorkspaceID = strings.TrimSpace(input.WorkspaceID)
	input.DisplayName = strings.TrimSpace(input.DisplayName)
	input.Avatar = strings.TrimSpace(input.Avatar)
	input.Password = strings.TrimSpace(input.Password)
	if input.MemberID == "" || input.WorkspaceID == "" || input.Password == "" || !validRole(input.Role) {
		return PublicAccount{}, fmt.Errorf("%w: memberId, workspaceId, password, and role are required", ErrInvalid)
	}
	if input.DisplayName == "" {
		input.DisplayName = input.MemberID
	}
	if input.Avatar == "" {
		input.Avatar = initials(input.MemberID)
	}
	hash, err := hashPassword(input.Password)
	if err != nil {
		return PublicAccount{}, err
	}
	now := time.Now().UTC()
	account := Account{
		MemberID:     input.MemberID,
		WorkspaceID:  input.WorkspaceID,
		DisplayName:  input.DisplayName,
		Role:         input.Role,
		Avatar:       input.Avatar,
		PasswordHash: hash,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	accounts, err := s.readLocked()
	if err != nil {
		return PublicAccount{}, err
	}
	for _, existing := range accounts {
		if existing.MemberID == account.MemberID {
			return PublicAccount{}, fmt.Errorf("%w: member already exists", ErrInvalid)
		}
	}
	accounts = append(accounts, account)
	if err := s.writeLocked(accounts); err != nil {
		return PublicAccount{}, err
	}
	return public(account), nil
}

func (s *Service) Update(memberID string, patch SeedAccount) (PublicAccount, error) {
	memberID = strings.TrimSpace(memberID)
	s.mu.Lock()
	defer s.mu.Unlock()
	accounts, err := s.readLocked()
	if err != nil {
		return PublicAccount{}, err
	}
	for i := range accounts {
		if accounts[i].MemberID != memberID {
			continue
		}
		if strings.TrimSpace(patch.DisplayName) != "" {
			accounts[i].DisplayName = strings.TrimSpace(patch.DisplayName)
		}
		if strings.TrimSpace(patch.Avatar) != "" {
			accounts[i].Avatar = strings.TrimSpace(patch.Avatar)
		}
		if validRole(patch.Role) {
			accounts[i].Role = patch.Role
		}
		if strings.TrimSpace(patch.Password) != "" {
			hash, err := hashPassword(strings.TrimSpace(patch.Password))
			if err != nil {
				return PublicAccount{}, err
			}
			accounts[i].PasswordHash = hash
		}
		accounts[i].UpdatedAt = time.Now().UTC()
		if err := s.writeLocked(accounts); err != nil {
			return PublicAccount{}, err
		}
		return public(accounts[i]), nil
	}
	return PublicAccount{}, ErrNotFound
}

func (s *Service) seed(seeds []SeedAccount) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	accounts, err := s.readLocked()
	if err != nil {
		return err
	}
	if len(accounts) > 0 {
		return nil
	}
	now := time.Now().UTC()
	for _, seed := range seeds {
		if strings.TrimSpace(seed.Password) == "" {
			continue
		}
		hash, err := hashPassword(seed.Password)
		if err != nil {
			return err
		}
		accounts = append(accounts, Account{
			MemberID:     strings.TrimSpace(seed.MemberID),
			WorkspaceID:  strings.TrimSpace(seed.WorkspaceID),
			DisplayName:  strings.TrimSpace(seed.DisplayName),
			Role:         seed.Role,
			Avatar:       strings.TrimSpace(seed.Avatar),
			PasswordHash: hash,
			CreatedAt:    now,
			UpdatedAt:    now,
		})
	}
	return s.writeLocked(accounts)
}

func (s *Service) readLocked() ([]Account, error) {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var accounts []Account
	if err := json.Unmarshal(data, &accounts); err != nil {
		return nil, err
	}
	return accounts, nil
}

func (s *Service) writeLocked(accounts []Account) error {
	data, err := json.MarshalIndent(accounts, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, append(data, '\n'), 0o600)
}

func public(account Account) PublicAccount {
	return PublicAccount{
		MemberID:    account.MemberID,
		WorkspaceID: account.WorkspaceID,
		DisplayName: account.DisplayName,
		Role:        account.Role,
		Avatar:      account.Avatar,
		CreatedAt:   account.CreatedAt,
		UpdatedAt:   account.UpdatedAt,
	}
}

func hashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	sum := passwordDigest(salt, []byte(password))
	return "ok1." + base64.RawURLEncoding.EncodeToString(salt) + "." + base64.RawURLEncoding.EncodeToString(sum), nil
}

func verifyPassword(encoded, password string) bool {
	parts := strings.Split(encoded, ".")
	if len(parts) != 3 || parts[0] != "ok1" {
		return false
	}
	salt, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return false
	}
	expected, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return false
	}
	actual := passwordDigest(salt, []byte(password))
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

func passwordDigest(salt, password []byte) []byte {
	sum := sha256.Sum256(append(append([]byte{}, salt...), password...))
	out := sum[:]
	for range 120_000 {
		next := sha256.Sum256(append(out, password...))
		out = next[:]
	}
	return out
}

func validRole(role authz.Role) bool {
	switch role {
	case authz.RoleOwner, authz.RoleSupervisor, authz.RoleAssistant, authz.RoleMember:
		return true
	default:
		return false
	}
}

func roleRank(role authz.Role) int {
	switch role {
	case authz.RoleOwner:
		return 4
	case authz.RoleSupervisor:
		return 3
	case authz.RoleAssistant:
		return 2
	case authz.RoleMember:
		return 1
	default:
		return 0
	}
}

func initials(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "U"
	}
	if len(value) > 2 {
		return strings.ToUpper(value[:2])
	}
	return strings.ToUpper(value)
}
