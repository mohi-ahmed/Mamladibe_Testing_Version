# Mamladibe Verified Admin API Contract

Version: 1.0  
Status: Implementation baseline  
Base path: `/api/admin`  
Authority: Mamladibe SRS V1 FR-092 through FR-114, the verified public API contract, and the existing backend data models

## 1. Frozen V1 decisions

- Admin UI routes live under `/admin/*`; admin APIs live under `/api/admin/*`.
- Only `moderator` and `super_admin` roles exist.
- Login is one request containing email, password, and TOTP. A request missing any factor cannot create a session.
- Passwords use Argon2id, have a minimum length of 12 characters, and are never returned or logged.
- TOTP uses a 30-second step and a verification window of plus or minus one step. Secrets are encrypted at rest and never returned after enrolment.
- Five consecutive failed logins lock an account for 15 minutes. Login is also limited per HMAC network hash.
- An active session has an eight-hour absolute lifetime and a 30-minute idle lifetime.
- Session cookie name: `mdb_admin`. CSRF cookie name: `mdb_admin_csrf`. CSRF header: `X-CSRF-Token`.
- Admin responses use `Cache-Control: no-store`; admin HTML uses `X-Robots-Tag: noindex, nofollow`.
- Every state-changing admin action requires a written reason and creates an append-only audit entry in the same MongoDB transaction as the state change.
- Raw IP addresses, raw browser tokens, reporter Secrets, password hashes, session hashes, CSRF hashes, and TOTP secrets are never returned.
- Admins do not decide whether an incident is true or false. Moderation outcomes concern policy and visibility only.
- Flags never trigger automatic hiding or deletion.

The older `/api/v1/admin` path and the proposed two-step login flow are not used. The running public API already uses `/api`, and the SRS defines `/api/admin/login` with all three authentication factors.

## 2. Transport and security

### 2.1 Session cookies

Successful login sets both cookies:

```http
Set-Cookie: mdb_admin=<random-256-bit-token>; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=28800
Set-Cookie: mdb_admin_csrf=<random-token>; Secure; SameSite=Strict; Path=/api/admin; Max-Age=28800
```

Only SHA-256 hashes of the session and CSRF tokens are stored. Local development omits `Secure`; production never does.

Every authenticated request checks account activity, absolute expiry, and idle expiry. A valid request updates `lastSeenAt` with a write-throttled interval of at most once per minute. Expired sessions are deleted and return `UNAUTHORIZED`.

### 2.2 Mutation protection

Every `POST`, `PATCH`, and `DELETE` admin request except login and enrolment must provide:

```http
Origin: <an exact allowed frontend origin>
X-CSRF-Token: <value matching mdb_admin_csrf>
```

The server verifies the Origin, CSRF cookie, CSRF header, and stored CSRF hash. Missing or mismatched values return `CSRF_INVALID` or `ORIGIN_NOT_ALLOWED`.

### 2.3 Common response shapes

Single resource:

```json
{ "item": {} }
```

List:

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid.",
    "fieldErrors": { "reason": "Reason must contain 5 to 500 characters." },
    "requestId": "req_01H..."
  }
}
```

Unknown body fields are rejected. Default page size is 20; maximum is 100.

Common validation: email is lowercased and limited to 254 characters; password is 12 to 128
characters; TOTP is exactly six digits; `reason` is trimmed and contains 5 to 500 characters;
review and moderator notes contain at most 1,000 characters; free-text query values contain at most
100 characters; IDs and enum values must match their canonical format exactly.

## 3. Canonical enums

```ts
type AdminRole = "moderator" | "super_admin";
type ContentStatus = "published" | "hidden" | "deleted";
type FlagReviewStatus = "pending" | "reviewed";
type FlagOutcome = "kept" | "hidden" | "removed";
type BlockTargetType = "anonymous_id" | "network_hash";
type BlockMode = "temporary" | "permanent";
type AdminIncidentLabel = "official" | "test";
```

Audit action values:

```ts
type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "auth.login_failed"
  | "incident.create"
  | "incident.redact"
  | "incident.hide"
  | "incident.unhide"
  | "incident.delete"
  | "incident.restore"
  | "incident.purge"
  | "comment.hide"
  | "comment.unhide"
  | "comment.delete"
  | "comment.restore"
  | "comment.purge"
  | "flag.review"
  | "activity.view"
  | "bulk.remove"
  | "block.create"
  | "block.remove"
  | "admin.create"
  | "admin.update"
  | "admin.reset_2fa";
```

## 4. Role and permission matrix

| Capability                                           |   Moderator | Super Admin |
| ---------------------------------------------------- | ----------: | ----------: |
| View dashboard and moderation queues                 |         Yes |         Yes |
| List and inspect hidden/deleted content              |         Yes |         Yes |
| Hide, unhide, soft-delete, and restore content       |         Yes |         Yes |
| Redact incident text with preserved previous version |         Yes |         Yes |
| Review flags                                         |         Yes |         Yes |
| View activity by Tracking ID or Anonymous ID         |         Yes |         Yes |
| Remove suspicious votes/flags/comments in bulk       |         Yes |         Yes |
| Create temporary Anonymous ID block                  |          No |         Yes |
| Create permanent or network-hash block               |          No |         Yes |
| Permanently delete content                           |          No |         Yes |
| Create, disable, or change admin roles               |          No |         Yes |
| Reset admin 2FA                                      |          No |         Yes |
| Read audit log                                       | Own entries | All entries |

Server authorization is mandatory even when the UI hides a control.

## 5. Shared admin DTOs

```ts
interface AdminIdentity {
  id: string;
  email: string;
  role: AdminRole;
}

interface AdminIncident {
  trackingId: string;
  title: string;
  description: string;
  category: "accident" | "violation" | "police" | "road" | "safety" | "other";
  lat: number;
  lng: number;
  roadName: string;
  areaName: string;
  incidentAt: string;
  createdAt: string;
  safetyTip?: string;
  status: ContentStatus;
  source: "public" | "admin";
  adminLabel?: AdminIncidentLabel;
  anonymousId?: string;
  support: number;
  dispute: number;
  flags: number;
  commentCount: number;
  isEdited: boolean;
  editedAt?: string;
  byModerator: boolean;
  hiddenAt?: string;
  deletedAt?: string;
}

interface AuditEntry {
  id: string;
  admin: AdminIdentity;
  action: AuditAction;
  targetType: "incident" | "comment" | "flag" | "vote" | "actor" | "block" | "admin";
  targetId: string;
  reason: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: string;
}
```

`anonymousId` is an admin-only pseudonymous reference derived from the stored HMAC actor ID. It is not the raw cookie and does not identify a real person. Network references are visible only to Super Admins.

## 6. Authentication and enrolment

### 6.1 Login

`POST /api/admin/login`

```json
{
  "email": "moderator@example.com",
  "password": "strong-password-value",
  "totpCode": "123456"
}
```

Success: `200 OK`, sets both cookies.

```json
{
  "admin": {
    "id": "adm_01H...",
    "email": "moderator@example.com",
    "role": "moderator"
  },
  "csrfToken": "csrf-token",
  "session": {
    "absoluteExpiresAt": "2026-11-13T16:00:00.000Z",
    "idleExpiresAt": "2026-11-13T08:30:00.000Z"
  }
}
```

Wrong email, password, TOTP, inactive account, or missing account returns the same `401 ADMIN_CREDENTIALS_INVALID`. The response must not reveal which factor failed. The fifth consecutive failed attempt locks the account for 15 minutes and returns `423 ADMIN_ACCOUNT_LOCKED`; network throttling returns `429 RATE_LIMITED`.

### 6.2 Current session

`GET /api/admin/session`

Returns the same `admin`, `csrfToken`, and session expiry data. It never rotates the session token. It may refresh the CSRF cookie only when the stored token is missing or expired.

### 6.3 Logout

`DELETE /api/admin/session`

Requires Origin and CSRF. Deletes the server session, clears both cookies, writes `auth.logout`, and returns `204 No Content`.

### 6.4 First Super Admin

No public endpoint exists. `npm run admin:bootstrap` creates the first Super Admin using `ADMIN_BOOTSTRAP_EMAIL`, prompts for a password, generates a TOTP enrolment URI once, and refuses to run when an active Super Admin already exists unless an explicit recovery mode is used.

### 6.5 Moderator enrolment

`POST /api/admin/users` creates an inactive pending account and returns a one-time enrolment token to the Super Admin. Only its hash is stored and it expires after 24 hours.

`POST /api/admin/enrol/start`

```json
{ "token": "one-time-token", "password": "new-admin-password" }
```

Returns a TOTP `otpauthUri` once and sets a 15-minute HttpOnly enrolment cookie.

`POST /api/admin/enrol/verify`

```json
{ "totpCode": "123456" }
```

Activates the account after a valid code, consumes the enrolment token, clears the enrolment cookie, and returns `204`. Enrolment never creates an authenticated admin session; the new admin must log in normally.

## 7. Dashboard

`GET /api/admin/dashboard`

```json
{
  "totals": {
    "incidents": 120,
    "comments": 340,
    "votes": 800,
    "openFlags": 14
  },
  "today": {
    "incidents": 8,
    "comments": 21,
    "votes": 45,
    "flags": 3
  },
  "waitingForReview": {
    "incidentFlags": 9,
    "commentFlags": 5,
    "hiddenIncidents": 2,
    "hiddenComments": 4
  }
}
```

All day boundaries use `Asia/Dhaka`.

## 8. Incident moderation

### 8.1 List and detail

`GET /api/admin/incidents`

Query: `q`, `trackingId`, `anonymousId`, `status`, `category`, `source`, `flagged`, `from`, `to`, `page`, `pageSize`, `sort`. `sort` is `newest` or `oldest`.

`GET /api/admin/incidents/:trackingId`

Detail returns `{ incident, versions, comments, flags, moderationHistory }`. It includes hidden and soft-deleted content but never reporter credentials.

### 8.2 Create official or test incident

`POST /api/admin/incidents`

Uses the public incident fields except CAPTCHA, plus:

```json
{
  "adminLabel": "official",
  "reason": "Official road closure notice"
}
```

Success: `201`. Public DTOs expose `adminLabel` so the UI can clearly label the post. `source` is `admin`.

### 8.3 Moderate incident

`PATCH /api/admin/incidents/:trackingId`

```json
{
  "action": "hide",
  "reason": "Contains a private home address"
}
```

```ts
type IncidentAction = "hide" | "unhide" | "soft_delete" | "restore";
```

Allowed transitions:

- `published -> hidden`: `hide`
- `hidden -> published`: `unhide`
- `published|hidden -> deleted`: `soft_delete`
- `deleted -> hidden`: `restore`

Invalid transitions return `409 CONFLICT`.

### 8.4 Redact incident

`PATCH /api/admin/incidents/:trackingId/redaction`

```json
{
  "title": "Redacted title",
  "description": "The private address has been removed without changing the incident meaning.",
  "safetyTip": null,
  "reason": "Removed private information"
}
```

At least one content field is required. The old text is saved in `incident_versions` with `editedBy: "moderator"`; `byModerator` becomes true. Category, location, and incident time cannot be changed through redaction.

### 8.5 Permanent delete

`DELETE /api/admin/incidents/:trackingId/permanent`

```json
{ "reason": "Required legal deletion" }
```

Super Admin only. Deletes dependent versions, comments, votes, and flags in a transaction, then the incident. The audit entry keeps only a small non-sensitive summary.

## 9. Comment moderation

`GET /api/admin/comments`

Query: `q`, `incidentTrackingId`, `anonymousId`, `type`, `status`, `flagged`, `from`, `to`, `page`, `pageSize`, `sort`.

`GET /api/admin/comments/:commentId`

`PATCH /api/admin/comments/:commentId`

```json
{ "action": "hide", "reason": "Contains harassment" }
```

Actions: `hide`, `unhide`, `soft_delete`, `restore`. Comment editing/redaction is not part of SRS V1.

`DELETE /api/admin/comments/:commentId/permanent`

Super Admin only; requires `{ "reason": "..." }`. Comment deletion does not release the public rolling quota.

## 10. Flag review queue

`GET /api/admin/flags`

Query: `reviewStatus`, `targetType`, `reason`, `trackingId`, `from`, `to`, `page`, `pageSize`. Pending items are oldest first by default.

Each item contains the flag, target preview, target status, target flag count, and anonymous reporter reference. It never includes raw IP or cookie data.

`GET /api/admin/flags/:flagId`

`PATCH /api/admin/flags/:flagId`

```json
{
  "outcome": "hidden",
  "note": "Target was hidden because it exposed private information.",
  "reason": "Privacy policy violation"
}
```

Outcome is `kept`, `hidden`, or `removed`. The flag becomes `reviewed`. `hidden` or `removed` does not silently mutate the target; the target moderation action and flag review execute together in one transaction and create one audit entry. Flags are retained for audit and have no delete endpoint.

## 11. Anonymous activity and bulk actions

### 11.1 Activity lookup

`GET /api/admin/activity?trackingId=MD-7K3Q9X`

or

`GET /api/admin/activity?anonymousId=anon_...`

Exactly one lookup key is required. Opening the result writes `activity.view` with a required `X-Activity-Reason` header containing one of `moderation_review`, `abuse_investigation`, or `support_request`.

The response contains the actor's first/last seen times and a chronological timeline of incident creation, incident edits, votes, flags, and comments. It excludes reporter Secrets, raw cookies, raw IPs, and cross-device identity claims.

### 11.2 Moderator notes

- `GET /api/admin/actors/:anonymousId/notes`
- `POST /api/admin/actors/:anonymousId/notes`

Create request:

```json
{
  "text": "Repeated spam pattern observed across several incidents.",
  "reason": "Documenting an abuse investigation"
}
```

Notes are admin-only, append-only, and show their author and creation time. Creating a note writes
an audit entry. Notes never contain raw IPs, cookies, reporter Secrets, or unsupported claims about
a person's real identity.

### 11.3 Bulk removal

`POST /api/admin/bulk-actions`

```json
{
  "targetType": "vote",
  "targetIds": ["vote-id-1", "vote-id-2"],
  "action": "remove",
  "reason": "Coordinated automated voting pattern"
}
```

Maximum 100 target IDs. Supported combinations:

- vote + `remove`: delete vote records.
- comment + `hide` or `soft_delete`: update comment status.
- flag + `invalidate`: mark flags reviewed with outcome `removed`; do not hard-delete them.

The response reports `requested`, `changed`, and `unchanged`. The audit entry contains target IDs and counts, not full user text.

## 12. Blocks

Super Admin only.

- `GET /api/admin/blocks`
- `POST /api/admin/blocks`
- `DELETE /api/admin/blocks/:blockId`

Create:

```json
{
  "targetType": "anonymous_id",
  "targetRef": "anon_...",
  "mode": "temporary",
  "expiresAt": "2026-11-20T12:00:00.000Z",
  "reason": "Repeated automated abuse"
}
```

`expiresAt` is required for temporary mode and forbidden for permanent mode. Removing a block requires `{ "reason": "..." }`; the record is deactivated with `removedBy` and `removedAt`, not deleted.

## 13. Admin users

Super Admin only.

- `GET /api/admin/users`
- `GET /api/admin/users/:adminId`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:adminId`
- `POST /api/admin/users/:adminId/reset-2fa`

Create:

```json
{
  "email": "new.moderator@example.com",
  "role": "moderator",
  "reason": "Adding a moderation team member"
}
```

Returns the one-time enrolment token described in section 6.5.

Patch:

```json
{
  "role": "moderator",
  "active": false,
  "reason": "Access revoked after team departure"
}
```

Disabling an account or resetting 2FA revokes all sessions. A Super Admin cannot deactivate or demote themself, and the final active Super Admin cannot be disabled or demoted. Admin accounts are deactivated, not hard-deleted, so audit references remain valid.

## 14. Audit log

`GET /api/admin/audit`

Query: `adminId`, `action`, `targetType`, `targetId`, `from`, `to`, `page`, `pageSize`, `sort`.

Moderators receive only their own entries even if they submit another `adminId`. Super Admins may read all entries. There is no create, update, or delete audit endpoint.

Audit summaries must not contain passwords, hashes, TOTP data, session/CSRF tokens, reporter Secrets, raw IPs, raw browser tokens, or complete private text removed during redaction.

## 15. Status and error registry

| HTTP | Code                        | Meaning                                                                   |
| ---: | --------------------------- | ------------------------------------------------------------------------- |
|  400 | `VALIDATION_ERROR`          | Invalid field, malformed JSON, or unknown property                        |
|  401 | `ADMIN_CREDENTIALS_INVALID` | Generic login failure                                                     |
|  401 | `UNAUTHORIZED`              | Missing, expired, idle-expired, or revoked session                        |
|  403 | `FORBIDDEN`                 | Role does not permit the action                                           |
|  403 | `CSRF_INVALID`              | CSRF cookie/header/hash mismatch                                          |
|  403 | `ORIGIN_NOT_ALLOWED`        | Mutation Origin is not allowed                                            |
|  404 | `NOT_FOUND`                 | Admin resource does not exist                                             |
|  409 | `CONFLICT`                  | Invalid status transition, duplicate email, or last-Super-Admin safeguard |
|  410 | `ENROLMENT_EXPIRED`         | Enrolment token expired or was consumed                                   |
|  423 | `ADMIN_ACCOUNT_LOCKED`      | Five failed logins; includes `retryAfterSeconds`                          |
|  429 | `RATE_LIMITED`              | Login or admin action rate limit exceeded                                 |
|  500 | `INTERNAL_ERROR`            | Unexpected failure with no internals exposed                              |
|  503 | `SERVICE_UNAVAILABLE`       | Required database or Redis service is unavailable                         |

## 16. Transaction and audit rules

These operations must use MongoDB transactions:

- content state change plus audit entry;
- incident redaction plus version plus audit entry;
- flag review plus target action plus audit entry;
- bulk action plus audit entry;
- block create/remove plus audit entry;
- admin role/activity change plus session revocation plus audit entry;
- permanent incident deletion plus dependent deletion plus audit entry.

If the transaction fails, no partial moderation result is committed. Audit entries are created only by services; no repository method permits updating or deleting them.

## 17. Required acceptance tests

1. Every admin route returns `401` without a valid session.
2. Every mutation rejects a missing Origin or CSRF token.
3. Login without a valid TOTP creates no session.
4. Five failed logins lock the account for 15 minutes without revealing which factor failed.
5. Idle and absolute session expiry both revoke access.
6. Moderator can hide/unhide/soft-delete/restore but cannot permanently delete.
7. Moderator cannot manage admin users, reset 2FA, or create blocks.
8. Fifty flags do not hide content until a human action occurs.
9. Redaction preserves the previous incident version and sets `byModerator`.
10. Every state change and actor activity view creates the required immutable audit entry.
11. Failed transactions leave neither a state change nor an orphan audit entry.
12. Public endpoints do not return hidden or deleted incidents.
13. Admin APIs never return Secrets, raw IPs, raw browser tokens, password/TOTP/session/CSRF hashes, or HTML-rendered user content.
14. Disabling an admin revokes all sessions.
15. The last active Super Admin cannot be disabled or demoted.

## 18. Required implementation deltas

The existing schemas are a valid foundation, with these controlled changes required before routes are implemented:

- `admin_users`: make encrypted TOTP optional while enrolment is pending; add enrolment-token hash/expiry and activation state.
- `admin_sessions`: existing `sessionHash`, `csrfHash`, `lastSeenAt`, and `expiresAt` already match this contract.
- `incidents`: add optional `adminLabel` with `official|test` for admin-created posts.
- `audit_logs`: constrain action and target enums at validation/service level; keep the collection append-only.
- `rate_events`: admin login events remain short-lived and contain only actor/network hashes.
- activity timeline: aggregate existing incident, version, vote, flag, comment, actor, and rate-event records; do not create a public profile.
- actor moderation notes: add an append-only notes subdocument or collection with admin and time.
- add `admin:bootstrap` script and admin auth/moderation tests before Admin UI work begins.

Any change to endpoint paths, role names, enum values, security cookies, response shapes, or error codes requires updating this contract, the main verified API contract, backend tests, and Admin frontend API client together.

## 19. SRS traceability

| SRS requirements                                                  | Contract sections |
| ----------------------------------------------------------------- | ----------------- |
| FR-092 through FR-095 Admin area, credentials, lockout, sessions  | 1, 2, 6           |
| FR-096 Dashboard metrics                                          | 7                 |
| FR-097 Authentication and RBAC                                    | 2, 4, 17          |
| FR-098 through FR-103 Incident management and official/test posts | 8                 |
| FR-104 Comment management                                         | 9                 |
| FR-105 through FR-106 Flag queue and outcomes                     | 10                |
| FR-107 through FR-108 Activity timeline                           | 11.1 and 11.2     |
| FR-109 Bulk suspicious-interaction removal                        | 11.3              |
| FR-110 Anonymous ID and network-hash blocks                       | 12                |
| FR-111 Admin account management                                   | 6.5 and 13        |
| FR-112 through FR-113 Append-only audit log                       | 14 and 16         |
| FR-114 No automatic moderation                                    | 1, 10, and 17     |
