# CryoCord Parking PWA

Guard-facing Progressive Web App for **CryoCord HQ car park access control** — plate
capture, QR visitor passes, and live occupancy. It is the `parking` module of the
CryoCord Workplace OS / ICS.

> **Status:** Front-end scaffold with deterministic **mock data**. All screens and
> client features work; the data layer and external integrations are stubbed behind
> clean seams (see [What's wired vs. stubbed](#whats-wired-vs-stubbed)).

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS (glassmorphic design system) |
| PWA | `@ducanh2912/next-pwa` (service worker, installable) |
| OCR | On-device `tesseract.js` (no image egress) |
| QR | `qrcode.react` (generate) + `@yudiel/react-qr-scanner` (scan) |
| Token | `jose` (HS256, opaque visit-id reference) |
| Charts | `recharts` |
| Data | Supabase/Postgres + TypeORM migrations |
| Container | Docker standalone Next.js image; Azure Container Apps compatible |

Brand tokens: primary red `#C8102E`, hover `#CC0000`, canvas `#F2F2F2`, font Arial.

---

## Quick start

```bash
# Node 18+ (built on Node 24)
npm install

npm run dev          # http://localhost:3000  (redirects to /parking)
npm run dev:https    # https on the LAN — required for camera testing on a phone
npm run build        # production build (also emits the PWA service worker)
npm run typecheck    # tsc --noEmit
npm run test         # Vitest unit tests
npm run test:coverage
npm run test:integration # requires .env.test with an isolated test DB
npm run lint
```

- The app entry point redirects `/` → `/parking`.
- **Camera** (entry OCR, exit QR scan) needs a *secure context*: it works on
  `http://localhost` and over HTTPS. On a phone via `http://<lan-ip>:3000` the camera
  is blocked by the browser — use `npm run dev:https` and open the `https://` URL.

## Docker

```bash
docker compose build
docker compose up

# Run migrations against the local Supabase dev database.
docker compose --profile tools run --rm migrate
```

Local database targets:

| File | Supabase DB container | Host URL |
|---|---|---|
| `.env` | `supabase_db_Cryocord-Policy-Hub-and-HR` | `postgresql://postgres:<password>@127.0.0.1:54322/postgres` |
| `.env.test` | `supabase_db_cryocord-hr-test` | `postgresql://postgres:<password>@127.0.0.1:55322/postgres` |

Both URLs connect to Supabase's default `postgres` database. The project data is
separated by schema: domain tables are created as `parking.visitors`,
`parking.visitor_types`, and `parking.visitor_scan_events`.

When running this app itself in Docker Compose, `docker-compose.yml` uses
`host.docker.internal:54322` so the app container can reach the
`Cryocord-Policy-Hub-and-HR` Supabase database on the host.

The production image uses Next.js standalone output and listens on `PORT=3000` with
`HOSTNAME=0.0.0.0`, which is the shape Azure Container Apps expects. Configure the
Container App health probe at `/api/health`.

For Azure Container Apps, set these as secrets/environment variables:

```bash
DATABASE_URL=<supabase-postgres-connection-string>
DATABASE_SSL=true
PARKING_QR_KEY_ID=<current-key-id>
PARKING_QR_SIGNING_KEY=<secret-from-key-vault>
NEXT_PUBLIC_APP_URL=https://<your-container-app-hostname>
```

Run `npm run db:migration:run` from CI/CD or a one-off migration container before
promoting a new revision. Avoid running migrations automatically in every app
container startup.

## Database

This project uses TypeORM for schema ownership and transactional backend writes, while
Supabase remains useful for auth, storage, realtime subscriptions, and admin tooling.
That hybrid keeps Laravel-style migrations and database constraints where scaling
matters, without forcing every UI read into an ORM abstraction.

The initial migration creates:

| Table | Purpose |
|---|---|
| `parking.visitor_types` | Seeded lookup: `guest`, `vendor`, `client`, `staff` |
| `parking.visitors` | Visitor identity, vehicle number, pending/check-in/check-out timestamps, remarks, QR token id |
| `parking.visitor_scan_events` | Append-only scan history for pass issuance, check-in, check-out, rejected scans |

QR codes contain a signed opaque token with the visitor primary key as a reference and
a JWT id (`jti`). They do not encode name, phone, or vehicle number. Scanning the pass
through `/api/visitors/scan` checks in a pending visitor or checks out an active one,
depending on the requested action.

## Testing

Tests use **Vitest**. The priority gate is `npm run test:integration` because it
exercises the real TypeORM/Supabase flow and database constraints. Unit tests still
cover pure edge cases quickly, but integration tests are the closest reflection of
the app's actual data behavior.

Use `.env.test` for integration tests. Start from `.env.test.example` and point
`TEST_DATABASE_URL` or `SUPABASE_TEST_DB_URL` at a dedicated test Supabase/Postgres
database. The test setup refuses to run against a remote URL unless it looks like a
test database or `CONFIRM_TEST_DATABASE_IS_ISOLATED=true` is set.

Mocking policy:

| Concern | Test approach |
|---|---|
| Core visitor state and QR lifecycle | Do not mock; unit-test pure rules and integration-test DB flow |
| Supabase/Postgres | Use isolated `.env.test` DB for integration tests only |
| Camera, QR scanner, OCR | Mock browser/hardware wrappers in component tests |
| WhatsApp/email/push delivery | Mock the sender and assert payloads; never send real messages in tests |
| Test data | Use Faker-backed factories and explicit seeders |

Current coverage focuses on:

| Area | Tests |
|---|---|
| Visitor scan state | pending → checked-in, checked-in → checked-out, duplicate scan rejection, cancelled pass rejection, timestamp invariants |
| Shared utilities | plate normalisation, duration formatting, negative-duration clamp |
| DB integration | pass creation, seeded visitor types, scan check-in/check-out flow, invalid checkout guard |

---

## Project structure

```
src/
  app/
    layout.tsx                 Root layout, PWA metadata, theme color
    page.tsx                   Redirect → /parking
    globals.css                Design system: ambient mesh, glass, motion
    parking/
      template.tsx             Per-route entrance animation
      layout.tsx               Guard shell: top bar, bottom nav, offline banner
      page.tsx                 Live dashboard (occupancy hero + on-site list)
      entry/page.tsx           New entry: camera/OCR → form → QR pass
      exit/page.tsx            Log exit: scan pass or search → confirm
      visits/page.tsx          Searchable visit log
      vehicles/page.tsx        Vehicle registry + blacklist (admin)
      admin/page.tsx           Occupancy charts, overstay alerts
      visit/[id]/page.tsx      Visit detail + audit trail
    pass/[token]/page.tsx      Public visitor pass page (linked from WhatsApp)
  components/
    brand/Logo.tsx             CryoCord lockup (inline SVG)
    ui/                        GlassCard, Button, Input, StatCard, badges, headers
    shell/                     TopBar, BottomNav, OfflineBanner, LiveClock
    parking/                   Screen-specific: new-entry-flow, plate-capture,
                               qr-pass, qr-scanner, exit-flow, occupancy-hero,
                               visits-list, vehicles-admin, visit-row, pass-view
  lib/
    enums.ts                   Single source of truth: visit_type, purpose, status…
    types.ts  labels.ts        Domain types + human labels
    mock.ts   data.ts          Demo data + the single data-access seam (data.*)
    qr.ts                      Opaque signed pass token (sign/verify)
    ocr.ts                     On-device plate OCR (Tesseract)
    camera.ts                  getUserMedia helpers + error messaging
    audit.ts                   Fail-closed audit contract + event→action map
    whatsapp.ts                wa.me deep link builder
    utils.ts                   cn(), time/plate helpers
public/
  manifest.webmanifest         PWA manifest
  icons/                       App icons (SVG)
```

**Good places to start reading:** `src/lib/data.ts` (data seam), `src/lib/enums.ts`
(domain model), `src/app/parking/page.tsx` (dashboard), and
`src/components/parking/new-entry-flow.tsx` (the core entry flow).

---

## Architecture decisions (ADR-001)

The module follows a compliance-first architecture (Malaysian PDPA 2010 as amended
2024). These are encoded as seams in `src/lib/`:

1. **Data residency** — visitor PII (incl. NRIC, patient visits) lives in self-hosted
   Supabase on **Azure Malaysia West**; managed Supabase is auth-only. No cross-border
   transfer → no Transfer Impact Assessment required.
2. **Fail-closed audit** — the audit row is written in the *same transaction* as the
   operational write (`src/lib/audit.ts` → `withAudit`); it is then async-mirrored to
   the ICS audit Postgres. A dropped mirror never loses an audit row.
3. **On-device OCR** — `tesseract.js` runs locally (`src/lib/ocr.ts`); no plate image
   leaves the device. Google Cloud Vision is intentionally not wired (would require a
   TIA).
4. **Opaque QR token** — the pass QR encodes only a signed `visit_id` reference
   (`src/lib/qr.ts`), never plate or PII; details resolve server-side on scan.

---

## What's wired vs. stubbed

**Working now (client-side):** all routes and navigation; glassmorphic UI + motion;
on-device plate OCR; QR generation + scanning; the `wa.me` WhatsApp pass link; the
public pass page; PWA install + offline banner.

**Stubbed (clean seams, ready to wire):**

| Concern | Where | TODO |
|---|---|---|
| Data access | `src/lib/data.ts` → `src/lib/mock.ts` | Swap mock for Supabase queries against the `parking` schema |
| Audit insert + ICS mirror | `src/lib/audit.ts` | `insertAuditRow` (same tx) + `mirrorToICS` (HMAC + retry/DLQ) |
| Pass token | `src/lib/qr.ts` | Sign server-side; inject key from Key Vault |
| Photo storage | entry flow | Upload plate snapshot to Azure Blob (MY West) |
| WhatsApp | `src/lib/whatsapp.ts` | Optional: WhatsApp Business API for automated + media send |
| Offline queue | `OfflineBanner` | IndexedDB write queue + background sync |

---

## Environment

Copy `.env.example` → `.env.local` and fill in. Secrets are provisioned via Azure Key
Vault in real environments; **never commit a filled `.env`** (`.gitignore` excludes it).

---

## Compliance notes

Internal CryoCord tooling. Data is collected for premises security/access control,
retained 90 days; audit trail retained 7 years. IC/NRIC capture is optional and off by
default (PII minimisation). All data and OCR stay in Malaysia under the architecture
above.
