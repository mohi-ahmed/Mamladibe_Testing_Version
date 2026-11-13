# Mamladibe Backend

Contract-first Node.js/TypeScript API for the existing Mamladibe public frontend. The public API follows `../Mamladibe/API_CONTRACT.md`; database decisions follow `../Mamladibe/Database.md`.

The Admin backend follows `ADMIN_API_CONTRACT.md`. The supplied Admin HTML remains a future UI reference; no Admin frontend is included in this phase.

## Implemented public API

- `POST /api/incidents`
- `GET /api/incidents`
- `GET /api/incidents/:trackingId`
- `POST|DELETE /api/incidents/:trackingId/vote`
- `POST /api/incidents/:trackingId/report`
- `GET|POST /api/incidents/:trackingId/comments`
- `DELETE /api/comments/:commentId`
- `POST /api/comments/:commentId/report`
- `POST /api/track`
- `PATCH /api/incidents/:trackingId/edit`
- `GET /api/geo/reverse`
- `GET /api/health`

## Structure

```text
src/
  config/       environment validation
  controllers/  HTTP input/output coordination
  database/     MongoDB lifecycle
  lib/          errors, crypto, constants and text rules
  middleware/   anonymous identity and origin protection
  models/       Mongoose schemas and indexes
  routes/       paths and middleware composition
  services/     business rules
  validation/   strict request schemas
  scripts/      controlled index synchronization
tests/          contract and rule tests
```

## Admin backend

Implemented under `/api/admin`:

- one-request email/password/TOTP login, 5-attempt lockout, 8-hour absolute and 30-minute idle sessions;
- HttpOnly session cookies, double-submit CSRF validation, exact-Origin checks and server-side RBAC;
- secure pending-admin enrolment and one-time TOTP setup;
- dashboard, incident/comment/flag moderation, anonymous activity/notes, bulk actions, blocks, admin users and append-only audit log;
- MongoDB transactions coupling every moderation state change to its audit entry.

Before creating the first account, set a unique `TOTP_ENCRYPTION_KEY` and optionally `ADMIN_BOOTSTRAP_EMAIL` in `.env`. Then run this only in an interactive private terminal:

```bash
npm run admin:bootstrap
```

The command masks password input, refuses to run when an active Super Admin exists, and prints the TOTP URI once. Never paste that URI, the password, or `.env` secrets into chat or source control.

## Local setup

Requirements: Node.js 20+, npm and MongoDB replica set support. Transactions used by quick edit require the replica set.

1. Copy `.env.example` to `.env` and replace all secret placeholders. Environment variables are loaded through `dotenv`.
2. Start MongoDB: `docker compose up -d`.
3. Install dependencies: `npm install`.
4. Synchronize indexes: `npm run db:indexes`.
5. Start the API: `npm run dev`.

The example MongoDB URI uses `replicaSet=rs0&directConnection=true`, allowing the host-run API to use the single-node Docker replica set and transactions.

The frontend origin must be listed in `ALLOWED_ORIGINS`. Browser requests must use credentials so `mdb_anon` is sent:

```ts
fetch("http://localhost:3001/api/incidents", { credentials: "include" });
```

When Redis variables are absent, development/test uses a process-local quota store. Production configuration rejects missing Upstash Redis and Turnstile credentials; the in-memory store is never a production fallback.

## Verification

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

## Security notes

- Reporter Secrets are returned once and persisted only as scrypt hashes with a server pepper.
- Raw anonymous cookie tokens are never persisted; actor IDs are HMAC-derived.
- MongoDB `_id`, actor IDs, hashes and Secrets are excluded from public incident DTOs.
- Public writes require an allowed `Origin` and an HttpOnly anonymous cookie.
- Production requires HTTPS so the cookie is `Secure`.
- CAPTCHA verification and the rolling comment quota are server-side.
- Incident, vote, flag and tracking actions have Redis-backed abuse limits; actor and network blocks are checked server-side.
- Index creation is a controlled command, not a production cold-start side effect.

Do not commit `.env`, production credentials or database exports.
