# Agent Workflow Guide

This file is the project-level checklist for coding agents working on this repo.
Follow it before calling any task finished.

## Project Context

- This is a Next.js parking PWA backed by PostgreSQL/Supabase-style schemas.
- Parking-owned data lives under the `parking` schema.
- HR host lookup reads from shared `public.users` and `public.departments`.
- Supabase auth users live under `auth.users`.
- Do not edit `.env` into commits. `.env` is ignored and can contain real secrets.
- Prefer scoped, repo-patterned changes. Do not rewrite unrelated files.

## Unit Tests

Run unit tests for local component, helper, parser, validation, and config changes:

```bash
npm test
```

Unit test facts:

- Vitest unit project uses `jsdom`.
- Unit tests are `src/**/*.test.{ts,tsx}`.
- Integration tests are excluded from the unit project.
- Add focused unit tests when changing UI logic, formatting, validation, masking,
  small server helpers, or environment/config parsing.

Before finishing a normal code change, also run:

```bash
npm run typecheck
npm run lint
```

## Integration Tests

Run integration tests for database, auth, OTP, visitor flow, QR, migrations-facing
logic, host lookup, and API route behavior:

```bash
npm run test:integration
```

Integration test facts:

- Vitest integration project uses Node.
- Integration tests are `src/**/*.integration.test.{ts,tsx}`.
- Tests rely on the configured isolated test database from `.env.test` or test env vars.
- The test guard should prevent accidental use of unsafe production databases.
- Integration tests may require sandbox/network/database approval in agent tooling.

Use integration coverage when touching:

- `src/lib/server/**`
- `src/app/api/**`
- `src/db/**`
- TypeORM entities or migrations
- QR token generation/verification
- OTP login/auth behavior
- `parking` schema reads/writes
- HR lookup from `public.users` or `public.departments`

Important migration note:

- `npm run db:migrate:fresh` drops only the `parking` schema and the TypeORM
  migration history table.
- It must not delete `auth.users`, `public.users`, or `public.departments`.
- Remote/production fresh migration requires explicit confirmation through
  `CONFIRM_PARKING_MIGRATE_FRESH=true`.

## E2E Tests

Run Playwright e2e for routing, login page behavior, public pass behavior, and
frontend smoke coverage:

```bash
PLAYWRIGHT_PORT=3114 npm run test:e2e
```

Use a fresh port if another dev server may already be running:

```bash
PLAYWRIGHT_PORT=3115 npm run test:e2e
```

E2E test facts:

- Playwright starts `npm run dev -- --port <PLAYWRIGHT_PORT> --hostname 127.0.0.1`.
- Tests run against desktop Chromium and mobile Chrome.
- The default port is `3100`; prefer a unique port during agent sessions.
- E2E tests may require browser/server sandbox approval in agent tooling.

Run e2e after changes to:

- User-facing routes or layouts
- Login/auth screens
- Public pass pages
- Parking entry/exit/arrival flows
- Mobile-responsive UI
- PWA or browser-facing behavior

## Final Scan

Before calling work complete, perform a final scan for security, best practices,
optimization, and efficiency.

Minimum final commands:

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
PLAYWRIGHT_PORT=3114 npm run test:e2e
npm run build
git diff --check
```

Run dependency audit when the task changes dependencies, build tooling, deploy
config, auth, network behavior, or before a push-readiness review:

```bash
npm audit --audit-level=moderate
```

Secret and safety scan:

```bash
git ls-files .env .env.test .env.local .env.production .env.development
rg -n "(BEGIN (RSA|OPENSSH|PRIVATE) KEY|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}|SMTP_PASS=|SUPABASE_.*=|DATABASE_URL=|PARKING_QR_SIGNING_KEY=)" --glob '!node_modules/**' --glob '!.next/**' --glob '!coverage/**' --glob '!test-results/**' --glob '!playwright-report/**' --glob '!public/sw.js' --glob '!public/workbox-*'
```

Review checklist:

- Auth, OTP, QR, and cookie/session logic must fail closed.
- QR tokens must remain opaque and must not expose visitor PII.
- SQL must be parameterized; avoid string-building with user input.
- `public.users` / `public.departments` are read-only HR lookup sources.
- Identity document display should stay masked unless explicitly revealed.
- Identity document edits by guards must remain audited.
- TLS verification should stay enabled by default. Any disabled TLS validation
  must be explicit, documented, and scoped to the relevant env var, such as
  `DATABASE_SSL_REJECT_UNAUTHORIZED=false` or
  `SMTP_TLS_REJECT_UNAUTHORIZED=false`.
- Avoid introducing broad destructive DB operations. Fresh reset should stay
  limited to `parking` schema.
- Keep UI mobile-safe: no overlapping text, no offscreen modals, and no controls
  hidden behind the bottom navigation.
- Prefer existing components, enums, server helpers, and TypeORM entities over
  new ad hoc patterns.
- Do not leave generated test reports, build artifacts, logs, or secrets staged.

Final response expectations:

- Mention any code or config changes made.
- List the commands that passed.
- If any command was not run, say why.
- If a security exception is required, name the exact env var and risk clearly.
