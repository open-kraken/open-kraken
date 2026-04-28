# System Account Management

## Scope

System login accounts are backend-owned. The browser logs in through:

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`

Owners manage accounts through:

- `GET /api/v1/system/users`
- `POST /api/v1/system/users`
- `PUT /api/v1/system/users/{memberId}`

## Storage

The server initializes accounts from the development seed list only when the account store is empty. After that, accounts are persisted under the app data root:

- `<appDataRoot>/accounts/accounts.json`

The seed list is therefore bootstrap data, not the runtime source of truth.

Stored account rows include:

- `memberId`
- `workspaceId`
- `displayName`
- `role`
- `avatar`
- salted password hash
- `createdAt`
- `updatedAt`

Plaintext passwords must never be returned by API responses.

## Authorization

Only `owner` accounts can use `/system/users`.

Supported mutations:

- create account with password and role
- update role
- update display name/avatar
- reset password

The roles are the existing authz roles:

- `owner`
- `supervisor`
- `assistant`
- `member`

## Verification

```bash
cd backend/go
GOWORK=off go test ./internal/account ./internal/api/http/handlers ./internal/api/http ./cmd/server
```
