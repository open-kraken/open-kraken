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

When the account service is configured, API role checks are enforced on the
backend before route handlers run. The middleware resolves the bearer token,
then re-reads the current account role from the account store, so a stale token
does not keep old privileges after a role change.

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

## Role Matrix

Backend action permissions:

| Role | Member manage | Role/account change | Chat | Roadmap read | Roadmap write | Project data write | Task queue control | AEL `/api/v2` | Terminal attach | Terminal dispatch |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `owner` | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| `supervisor` | yes | yes, except self-change | yes | yes | yes | yes | yes | yes | yes | yes |
| `assistant` | no | no | yes | yes | yes | yes | yes | yes | yes | no |
| `member` | no | no | yes | yes | no | no | no | no | yes | no |

Additional route-family rules:

- `owner` and `supervisor` can access all API route families.
- `assistant` can access read-oriented runtime views plus skills, nodes, ledger,
  token stats, task queue controls, and AEL `/api/v2`.
- `member` can read team/roadmap data, use chat/messages/presence, attach to
  terminal sessions, and read/write only their own settings.
- `/api/v1/auth/login` is public. `/api/v1/auth/me` is available to any
  authenticated account.

Frontend menu access:

| Role | Visible routes |
| --- | --- |
| `owner` | all routes |
| `supervisor` | all routes |
| `assistant` | Dashboard, Ledger, Runs, Chat, Team, Skills, Task Map, Observability, Sessions, Nodes, Settings, Account |
| `member` | Dashboard, Chat, Team, Observability, Sessions, Settings, Account |

System user management inside the System page remains owner-only even though supervisors can open the System health page.

## Verification

```bash
cd backend/go
GOWORK=off go test ./internal/account ./internal/api/http/handlers ./internal/api/http ./cmd/server ./internal/roster ./internal/ael
```
