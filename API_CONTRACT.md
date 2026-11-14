# Mamladibe Verified API Contract

Version: 1.0  
Status: Backend implementation baseline  
Sources: Mamladibe SRS V1 and the existing frontend behavior  
Base path: `/api`

## 1. Contract authority and compatibility decisions

This contract is the integration boundary between the existing Mamladibe frontend and the future backend.

When a detail is explicit in the SRS, the SRS wins. When the SRS leaves a public API detail open, the current frontend behavior is preserved so that backend integration does not change the user experience unexpectedly.

The following decisions are frozen for V1:

- The API base path is `/api`, matching the SRS initial API contract.
- Public incident URLs and public API lookups use `trackingId`. MongoDB `_id` values are never exposed as public identifiers.
- API timestamps are ISO 8601 UTC strings. The frontend converts them to local display time.
- API incident coordinates are flat `lat` and `lng` numbers to match the existing frontend. The backend stores them as GeoJSON `[lng, lat]`.
- List responses use page-number pagination because the existing frontend and SRS both use pages.
- Public actions are associated with a secure anonymous browser cookie. The raw Anonymous ID and network hash are never returned to the frontend.
- The reporter Secret is returned only by successful incident creation. It is never returned by any later endpoint.
- Tracking and quick-edit credentials are sent only in JSON request bodies.
- The current frontend's SRS constants are canonical: five comments per rolling 24 hours, ten comments per page, a 15-minute quick-edit window, and a maximum combined edit-change ratio of 20 percent.
- Admin pages are not implemented in the current frontend, but their API contract is included because they are required by the SRS.

## 2. Transport and common conventions

### 2.1 Request rules

- Production transport: HTTPS only.
- Content type: `application/json; charset=utf-8`.
- Unknown JSON properties are rejected with `VALIDATION_ERROR`.
- State-changing public requests require the anonymous browser cookie and an allowed `Origin`.
- Admin requests require the admin session cookie. State-changing admin requests also require `X-CSRF-Token`.
- Secrets, session tokens, raw browser tokens, raw IP addresses, password hashes and TOTP secrets must never appear in URLs, responses or application logs.

### 2.2 Anonymous cookie

The backend creates the anonymous cookie when the browser first performs a public write action.

```http
Set-Cookie: mdb_anon=<random-token>; HttpOnly; Secure; SameSite=Lax; Path=/
```

The backend derives its internal pseudonymous identifier from this token. The frontend does not read or store the token.

### 2.3 Success envelope

Single-resource endpoints return a named resource:

```json
{
  "incident": {}
}
```

List endpoints return:

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

### 2.4 Error envelope

Every non-2xx response uses this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid.",
    "fieldErrors": {
      "title": "Title must contain 5 to 100 characters."
    },
    "details": {},
    "requestId": "req_01H..."
  }
}
```

`fieldErrors` and `details` are optional. `message` is safe for display but the frontend should primarily translate `code`.

## 3. Canonical enums

These string values are case-sensitive.

### 3.1 Incident category

```ts
type CategoryId = "accident" | "violation" | "police" | "road" | "safety" | "other";
```

| Value       | Display name                   |
| ----------- | ------------------------------ |
| `accident`  | Road Accident                  |
| `violation` | Traffic Violation              |
| `police`    | Police Misconduct / Harassment |
| `road`      | Road & Infrastructure Issues   |
| `safety`    | Public Safety Concern          |
| `other`     | Other                          |

### 3.2 Vote

```ts
type VoteType = "support" | "dispute";
```

### 3.3 Comment type

```ts
type CommentType = "correction" | "extra" | "opinion";
```

| Value        | Display name      |
| ------------ | ----------------- |
| `correction` | Correction        |
| `extra`      | Extra information |
| `opinion`    | My opinion        |

### 3.4 Incident flag reason

```ts
type IncidentFlagReason = "spam" | "fake" | "misleading" | "inappropriate" | "irrelevant";
```

### 3.5 Comment flag reason

```ts
type CommentFlagReason = "spam" | "abusive" | "private" | "irrelevant";
```

### 3.6 Content status

```ts
type ContentStatus = "published" | "hidden" | "deleted";
```

- `published`: visible through public endpoints.
- `hidden`: unavailable publicly; recoverable by an authorized admin.
- `deleted`: soft-deleted and unavailable publicly; permanent deletion is Super Admin only.

### 3.7 Admin role

```ts
type AdminRole = "moderator" | "super_admin";
```

### 3.8 Flag review status and outcome

```ts
type FlagReviewStatus = "pending" | "reviewed";
type FlagOutcome = "kept" | "hidden" | "removed";
```

`outcome` is absent while `reviewStatus` is `pending`.

### 3.9 Block target and duration

```ts
type BlockTargetType = "anonymous_id" | "network_hash";
type BlockMode = "temporary" | "permanent";
```

## 4. Shared data transfer objects

### 4.1 Public incident

```ts
interface PublicIncident {
  trackingId: string;
  title: string;
  description: string;
  category: CategoryId;
  lat: number;
  lng: number;
  roadName: string;
  areaName: string;
  incidentAt: string;
  createdAt: string;
  safetyTip?: string;
  support: number;
  dispute: number;
  flags: number;
  commentCount: number;
  isEdited: boolean;
  editedAt?: string;
  byModerator: boolean;
  viewerState: {
    vote: VoteType | null;
    hasFlagged: boolean;
  };
}
```

The API never returns `secretHash`, internal Anonymous ID, network hash or MongoDB `_id`.

Frontend adapter rule: the current UI may derive its internal component key as `trackingId.toLowerCase()`. That derived key is not part of the network contract.

### 4.2 Public comment

```ts
interface PublicComment {
  id: string;
  trackingId: string;
  type: CommentType;
  text: string;
  createdAt: string;
  mine: boolean;
  canDelete: boolean;
  hasFlagged: boolean;
}
```

### 4.3 Incident version

```ts
interface IncidentVersion {
  version: number;
  title: string;
  description: string;
  safetyTip?: string;
  savedAt: string;
}
```

### 4.4 Community counts

```ts
interface CommunityCounts {
  support: number;
  dispute: number;
  flags: number;
  comments: number;
}
```

## 5. Public endpoints

### 5.1 Create incident

`POST /api/incidents`

Request:

```json
{
  "title": "Large pothole beside the bus stop",
  "description": "The pothole occupies most of the left lane.",
  "category": "road",
  "incidentAt": "2026-11-11T14:30:00.000Z",
  "lat": 23.7808,
  "lng": 90.4093,
  "roadName": "Airport Road",
  "areaName": "Banani",
  "safetyTip": "Use the right lane carefully.",
  "captchaToken": "turnstile-token"
}
```

Validation:

- `title`: trimmed, 5 to 100 characters.
- `description`: trimmed, 20 to 2,000 characters.
- `category`: one canonical category.
- `incidentAt`: valid time and not later than server time.
- `lat`, `lng`: inside Bangladesh.
- `roadName`, `areaName`: plain text; road name may be manually supplied after geocoding failure.
- `safetyTip`: optional, maximum 500 characters.
- Text is rendered as plain text and must not execute markup or scripts.
- CAPTCHA must be verified by the backend.

Success: `201 Created`

```json
{
  "incident": {
    "trackingId": "MD-7K3Q9X",
    "title": "Large pothole beside the bus stop",
    "description": "The pothole occupies most of the left lane.",
    "category": "road",
    "lat": 23.7808,
    "lng": 90.4093,
    "roadName": "Airport Road",
    "areaName": "Banani",
    "incidentAt": "2026-11-11T14:30:00.000Z",
    "createdAt": "2026-11-11T14:35:00.000Z",
    "safetyTip": "Use the right lane carefully.",
    "support": 0,
    "dispute": 0,
    "flags": 0,
    "commentCount": 0,
    "isEdited": false,
    "byModerator": false,
    "viewerState": { "vote": null, "hasFlagged": false }
  },
  "credentials": {
    "trackingId": "MD-7K3Q9X",
    "secret": "ABCD-EFGH-JKLM-NPQR"
  }
}
```

The backend generates both credentials. The Secret is shown once and only its secure hash is persisted.

Errors: `VALIDATION_ERROR`, `OUTSIDE_BANGLADESH`, `FUTURE_INCIDENT_TIME`, `CAPTCHA_FAILED`, `DUPLICATE_INCIDENT`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`.

### 5.2 List and search incidents

`GET /api/incidents`

Query parameters:

| Parameter  | Type                 | Meaning                                                |
| ---------- | -------------------- | ------------------------------------------------------ |
| `q`        | string               | Match road name, area name, location name or title     |
| `category` | CategoryId           | One category; omit for all                             |
| `from`     | ISO date/time        | Earliest incident time                                 |
| `to`       | ISO date/time        | Latest incident time                                   |
| `page`     | positive integer     | Default 1                                              |
| `pageSize` | integer              | Default 20, maximum 100                                |
| `sort`     | `newest` or `oldest` | Default `newest`                                       |
| `minLat`   | number               | Map viewport south boundary                            |
| `minLng`   | number               | Map viewport west boundary                             |
| `maxLat`   | number               | Map viewport north boundary                            |
| `maxLng`   | number               | Map viewport east boundary                             |
| `lat`      | number               | Nearby-search centre latitude                          |
| `lng`      | number               | Nearby-search centre longitude                         |
| `radiusKm` | number               | Nearby radius; default 5 km when nearby search is used |

The four viewport parameters must be supplied together. `lat`, `lng` and `radiusKm` must be supplied together for nearby search.

Success: `200 OK`

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

Only `published` incidents are returned.

### 5.3 Get incident details

`GET /api/incidents/:trackingId`

Success: `200 OK`

```json
{
  "incident": {}
}
```

Hidden, deleted and unknown incidents return the same `404 NOT_FOUND` public response.

### 5.4 Create or switch vote

`POST /api/incidents/:trackingId/vote`

Request:

```json
{ "type": "support" }
```

If a different vote already exists, it is replaced atomically.

Success: `200 OK`

```json
{
  "vote": "support"
}
```

The client updates the displayed vote and counts optimistically. Authoritative community counts are
returned by the normal incident detail/list/feed reads; the mutation response intentionally avoids a
second count aggregation so voting is not delayed by unrelated flag and comment queries.

### 5.5 Remove vote

`DELETE /api/incidents/:trackingId/vote`

This endpoint preserves the current frontend's vote-undo behavior.

Success: `200 OK`

```json
{
  "vote": null
}
```

### 5.6 Flag incident

`POST /api/incidents/:trackingId/report`

Request:

```json
{ "reason": "misleading" }
```

Success: `201 Created`

```json
{
  "report": {
    "id": "flag_01H...",
    "targetType": "incident",
    "reason": "misleading",
    "reviewStatus": "pending",
    "createdAt": "2026-11-11T14:40:00.000Z"
  },
  "flagCount": 2
}
```

One flag per Anonymous ID per target is enforced by a unique database constraint. A repeated flag returns `DUPLICATE_FLAG`.

### 5.7 List comments

`GET /api/incidents/:trackingId/comments?page=1&pageSize=10`

- Default and maximum V1 page size: 10.
- Sort: newest first.

Success: `200 OK` with `PublicComment[]` and pagination.

### 5.8 Create comment

`POST /api/incidents/:trackingId/comments`

Request:

```json
{
  "type": "extra",
  "text": "An ambulance has arrived at the location.",
  "captchaToken": "turnstile-token"
}
```

Rules:

- Text length: 5 to 500 characters.
- Plain text only; links are rejected in V1.
- Five comments per Anonymous ID in a rolling 24-hour period across all incidents.
- CAPTCHA is verified by the backend.

Success: `201 Created`

```json
{
  "comment": {},
  "quota": {
    "limit": 5,
    "used": 2,
    "remaining": 3,
    "resetsAt": "2026-11-12T11:10:00.000Z"
  }
}
```

### 5.9 Delete own comment

`DELETE /api/comments/:commentId`

The anonymous cookie must identify the original browser actor.

Success: `204 No Content`.

Errors: `FORBIDDEN`, `NOT_FOUND`.

### 5.10 Flag comment

`POST /api/comments/:commentId/report`

Request:

```json
{ "reason": "private" }
```

Success: `201 Created`. A repeated flag returns `DUPLICATE_FLAG`.

### 5.11 Track private report

`POST /api/track`

Request:

```json
{
  "trackingId": "MD-7K3Q9X",
  "secret": "ABCD-EFGH-JKLM-NPQR"
}
```

Success: `200 OK`

```json
{
  "incident": {},
  "status": "published",
  "versions": [],
  "edit": {
    "allowed": true,
    "deadline": "2026-11-11T14:50:00.000Z",
    "remainingSeconds": 540,
    "maxChangeRatio": 0.2
  }
}
```

Wrong Tracking ID and wrong Secret return the identical response:

```http
401 Unauthorized
```

```json
{
  "error": {
    "code": "TRACKING_CREDENTIALS_INVALID",
    "message": "Tracking ID or Secret is incorrect.",
    "requestId": "req_01H..."
  }
}
```

### 5.12 Quick edit

`PATCH /api/incidents/:trackingId/edit`

Request:

```json
{
  "secret": "ABCD-EFGH-JKLM-NPQR",
  "title": "Corrected title",
  "description": "Corrected description with the same incident meaning.",
  "safetyTip": "Use the right lane carefully."
}
```

Rules:

- Tracking ID and Secret authenticate the request.
- The request is accepted only during the first 15 minutes after creation using server time.
- Only `title`, `description` and `safetyTip` are accepted.
- Category, location and incident time are immutable.
- Before a successful update, the backend stores the prior text as a version.
- V1 compatibility rule: calculate Levenshtein distance over the combined string `title + "\n" + description + "\n" + safetyTip`, divide by the larger combined length, and reject a result greater than `0.20`.

Success: `200 OK`

```json
{
  "incident": {},
  "version": {
    "version": 1,
    "savedAt": "2026-11-11T14:42:00.000Z"
  }
}
```

Errors: `TRACKING_CREDENTIALS_INVALID`, `EDIT_WINDOW_EXPIRED`, `EDIT_CHANGE_TOO_LARGE`, `VALIDATION_ERROR`.

### 5.13 Health check

`GET /api/health`

Success:

```json
{
  "status": "ok",
  "timestamp": "2026-11-11T14:45:00.000Z"
}
```

Return `503 SERVICE_UNAVAILABLE` when required backend dependencies are unavailable.

## 6. Geocoding endpoint

The frontend currently uses a local Dhaka-area approximation. Production uses a backend proxy so provider credentials are not exposed.

### 6.1 Reverse geocode

`GET /api/geo/reverse?lat=23.7808&lng=90.4093`

Success:

```json
{
  "location": {
    "roadName": "Airport Road",
    "areaName": "Banani"
  }
}
```

Provider failure does not block incident submission when valid coordinates exist. The response may contain empty names and the frontend allows manual road entry.

## 7. Admin authentication endpoints

> **Authority note:** The implementation-ready Admin contract is maintained in
> `../MamladibeBackend/ADMIN_API_CONTRACT.md`. If this older summary conflicts with that
> dedicated contract, the dedicated contract wins. Public API sections in this file remain
> authoritative for the existing frontend.

### 7.1 Login

`POST /api/admin/login`

Request:

```json
{
  "email": "moderator@example.com",
  "password": "password-value",
  "totpCode": "123456"
}
```

Success: `200 OK`. The backend sets a Secure, HttpOnly, SameSite=Strict admin-session cookie.

```json
{
  "admin": {
    "id": "admin_01H...",
    "email": "moderator@example.com",
    "role": "moderator"
  },
  "csrfToken": "csrf-token"
}
```

All invalid login cases return the same `401 ADMIN_CREDENTIALS_INVALID` response. Repeated failures return `423 ADMIN_ACCOUNT_LOCKED` with `retryAfterSeconds`.

### 7.2 Session

- `GET /api/admin/session` returns the current admin and a CSRF token.
- `DELETE /api/admin/session` logs out and clears the session cookie.

## 8. Admin content and moderation endpoints

All state-changing actions require a non-empty `reason` and create an append-only audit entry.

### 8.1 Dashboard

`GET /api/admin/dashboard`

Returns total incidents, comments, votes and pending flags; new items today; and items waiting for review.

### 8.2 Incidents

- `GET /api/admin/incidents`
- `GET /api/admin/incidents/:trackingId`
- `POST /api/admin/incidents` creates a clearly labelled official/test incident.
- `PATCH /api/admin/incidents/:trackingId`
- `DELETE /api/admin/incidents/:trackingId` performs soft deletion.
- `DELETE /api/admin/incidents/:trackingId/permanent` is Super Admin only.

Moderation patch request:

```json
{
  "action": "hide",
  "reason": "Contains private information"
}
```

Supported actions:

```ts
type IncidentModerationAction = "hide" | "unhide" | "soft_delete" | "restore";
```

The authoritative action values are `hide`, `unhide`, `soft_delete`, and `restore`.
Redaction uses `PATCH /api/admin/incidents/:trackingId/redaction`; the prior version is
preserved and `byModerator` becomes true.

### 8.3 Comments

- `GET /api/admin/comments`
- `GET /api/admin/comments/:commentId`
- `PATCH /api/admin/comments/:commentId` with action `hide`, `unhide`, `soft_delete` or `restore`.
- `DELETE /api/admin/comments/:commentId` performs soft deletion.
- `DELETE /api/admin/comments/:commentId/permanent` is Super Admin only.

### 8.4 Flag review queue

- `GET /api/admin/flags?reviewStatus=pending&page=1&pageSize=20`
- `GET /api/admin/flags/:flagId`
- `PATCH /api/admin/flags/:flagId`

Review request:

```json
{
  "outcome": "hidden",
  "note": "Private information was visible in the target.",
  "reason": "Privacy rule"
}
```

The backend sets `reviewStatus` to `reviewed`. Outcome values are `kept`, `hidden` and `removed`.

### 8.5 Anonymous activity

`GET /api/admin/activity?trackingId=MD-7K3Q9X`

or

`GET /api/admin/activity?anonymousId=anon_8charprefix`

Exactly one lookup parameter is required. The response contains a chronological activity timeline without raw IP addresses, raw browser tokens or Secrets.

### 8.6 Blocks

- `GET /api/admin/blocks`
- `POST /api/admin/blocks`
- `DELETE /api/admin/blocks/:blockId`

Create request:

```json
{
  "targetType": "anonymous_id",
  "target": "anon_8charprefix",
  "mode": "temporary",
  "expiresAt": "2026-11-18T14:45:00.000Z",
  "reason": "Repeated automated abuse"
}
```

All block creation and removal is Super Admin only.

### 8.7 Admin users

Super Admin only:

- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:adminId`

Create request:

```json
{
  "email": "moderator@example.com",
  "role": "moderator"
}
```

Patch may change `role` or `active`. Password/TOTP enrolment data is delivered through a separate secure setup flow and never returned from list endpoints.

### 8.8 Audit log

`GET /api/admin/audit?page=1&pageSize=20&adminId=&action=&targetType=&targetId=&from=&to=`

- Moderator: own audit entries only.
- Super Admin: all audit entries.
- No update or delete endpoint exists.

## 9. HTTP status and error code registry

| HTTP | Code                           | Meaning                                                          |
| ---: | ------------------------------ | ---------------------------------------------------------------- |
|  400 | `VALIDATION_ERROR`             | Invalid field, malformed request or unknown property             |
|  400 | `CAPTCHA_FAILED`               | CAPTCHA missing, expired or invalid                              |
|  400 | `FUTURE_INCIDENT_TIME`         | Incident time is later than server time                          |
|  401 | `TRACKING_CREDENTIALS_INVALID` | Generic wrong Tracking ID or Secret                              |
|  401 | `ADMIN_CREDENTIALS_INVALID`    | Generic wrong email, password or TOTP                            |
|  401 | `UNAUTHORIZED`                 | Missing or expired admin session                                 |
|  403 | `FORBIDDEN`                    | Authenticated actor lacks permission                             |
|  403 | `CSRF_INVALID`                 | Missing or invalid admin CSRF token                              |
|  403 | `ORIGIN_NOT_ALLOWED`           | State-changing request from an unapproved origin                 |
|  403 | `EDIT_WINDOW_EXPIRED`          | Quick-edit window has ended                                      |
|  403 | `ACTOR_BLOCKED`                | Anonymous actor or network hash is blocked                       |
|  404 | `NOT_FOUND`                    | Resource is missing or not publicly visible                      |
|  409 | `DUPLICATE_FLAG`               | Same Anonymous ID already flagged the target                     |
|  409 | `DUPLICATE_INCIDENT`           | Duplicate incident policy rejected the submission                |
|  409 | `CONFLICT`                     | State changed concurrently or requested transition is invalid    |
|  422 | `OUTSIDE_BANGLADESH`           | Coordinates are outside the accepted boundary                    |
|  422 | `EDIT_CHANGE_TOO_LARGE`        | Combined edit-change ratio is greater than 20 percent            |
|  423 | `ADMIN_ACCOUNT_LOCKED`         | Admin login temporarily locked                                   |
|  429 | `COMMENT_LIMIT_EXCEEDED`       | Five comments already submitted in rolling 24 hours              |
|  429 | `RATE_LIMITED`                 | Action-specific rate limit exceeded                              |
|  500 | `INTERNAL_ERROR`               | Unexpected server failure; no internals exposed                  |
|  503 | `SERVICE_UNAVAILABLE`          | Required database, rate-limit or external dependency unavailable |

Rate-limit errors include:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Try again later.",
    "details": { "retryAfterSeconds": 60 },
    "requestId": "req_01H..."
  }
}
```

Comment-limit errors include `resetsAt`:

```json
{
  "error": {
    "code": "COMMENT_LIMIT_EXCEEDED",
    "message": "The five-comment limit has been reached.",
    "details": {
      "limit": 5,
      "resetsAt": "2026-11-12T11:10:00.000Z"
    },
    "requestId": "req_01H..."
  }
}
```

## 10. Frontend integration mapping

The production integration replaces the browser store with an API client while keeping component-facing data stable.

| Current frontend action        | API operation                                      |
| ------------------------------ | -------------------------------------------------- |
| `useIncidents()`               | `GET /api/incidents`                               |
| `useIncident(id)`              | `GET /api/incidents/:trackingId`                   |
| `publishReport()`              | `POST /api/incidents`                              |
| `castVote()`                   | `POST` or `DELETE /api/incidents/:trackingId/vote` |
| `flagIncident()`               | `POST /api/incidents/:trackingId/report`           |
| `useComments()`                | `GET /api/incidents/:trackingId/comments`          |
| `addComment()`                 | `POST /api/incidents/:trackingId/comments`         |
| Missing frontend delete action | `DELETE /api/comments/:commentId`                  |
| `flagComment()`                | `POST /api/comments/:commentId/report`             |
| `lookupReport()`               | `POST /api/track`                                  |
| `saveQuickEdit()`              | `PATCH /api/incidents/:trackingId/edit`            |
| Local `nearestArea()` demo     | `GET /api/geo/reverse`                             |

The frontend must not persist credentials, private tracking responses or admin session material in `localStorage`. TanStack Query may cache public resources in memory. Reporter credentials remain only in component memory long enough to show and download the one-time case slip.

## 11. Acceptance checks for integration

- Creating an incident returns credentials once and makes the incident visible from a second browser.
- The database contains no plaintext reporter Secret.
- Public incident APIs never expose MongoDB `_id`, Anonymous ID, network hash or secret hash.
- A second flag from the same browser actor returns `DUPLICATE_FLAG`.
- Switching Support to Dispute leaves one vote record; deleting the vote leaves none.
- The sixth comment inside the rolling 24-hour window returns `COMMENT_LIMIT_EXCEEDED` with `resetsAt`.
- The same browser can delete its own comment; another browser receives `FORBIDDEN` or the same safe not-found policy.
- Quick edit at minute 16 returns `EDIT_WINDOW_EXPIRED`.
- A change ratio above 20 percent returns `EDIT_CHANGE_TOO_LARGE` and does not create a version.
- Hidden and deleted incidents return the same public `NOT_FOUND` response as unknown incidents.
- Public requests cannot call admin endpoints.
- Moderator cannot permanently delete content or manage admin users.
- Every admin hide, delete, block and redaction action creates an immutable audit entry with a reason.
- CAPTCHA, rate limits, time windows and authorization are enforced on the server, not trusted to frontend state.

## 12. Items intentionally deferred

The following are not allowed to change the V1 public contract without a contract revision:

- Exact Tracking ID and Secret lengths. The current frontend displays a six-character Tracking ID suffix and a 16-character grouped Secret; the backend may strengthen the generation format only if the frontend input placeholders, case slip and tests are updated in the same change.
- Final production map-tile and geocoding provider.
- Exact numeric rate limits other than the five-comment rolling-24-hour rule.
- Exact admin session idle duration and lockout duration.
- Exact retention periods and purge implementation.
- English/Bangla interface-switch behavior.

Changes to endpoint paths, enum strings, public payload fields, error codes or pagination shape require updating this contract, the frontend API client and the corresponding integration tests together.
