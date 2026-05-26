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
| Data (planned) | Self-hosted Supabase (Azure Malaysia West) |

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
npm run lint
```

- The app entry point redirects `/` → `/parking`.
- **Camera** (entry OCR, exit QR scan) needs a *secure context*: it works on
  `http://localhost` and over HTTPS. On a phone via `http://<lan-ip>:3000` the camera
  is blocked by the browser — use `npm run dev:https` and open the `https://` URL.

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
