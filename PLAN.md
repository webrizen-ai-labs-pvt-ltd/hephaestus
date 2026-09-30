# Hephaestus — Build Plan

> **Status:** Draft for approval · **Owner:** Webrizen AI Labs Pvt Ltd · **Date:** 2026-09-30
> No code is written until this plan is approved.

Hephaestus is Webrizen's operations platform. It brings four pillars into one product:
**People** (employee management), **Work** (projects and tasks), **Collaboration** (contextual chat), and **Finance** (invoicing and payment collection).

It ships as **two editions from one codebase**:

| | ☁️ **Cloud (SaaS)** | 💻 **Offline edition** |
|---|---|---|
| Who | Any business, sign-up online | Businesses that want it on their own PCs, no internet dependency |
| Install | None, it's a website | One installer (`.exe` / `.dmg`), no Docker, no database setup |
| Users | Unlimited orgs (multi-tenant) | One organization per install, multiple PCs on the office network |
| Login | Webrizen SSO (`accounts.webrizen.com`) | Local users created in the app |
| Data | Supabase (cloud) | On the host PC |
| Sync between editions | — | None for now (standalone) |

---

## 1. Decisions so far

| # | Decision |
|---|---|
| D1 | Hephaestus is a multi-tenant SaaS **and** a standalone offline edition. |
| D2 | Cloud identity comes from **Webrizen SSO** (OpenID Connect, issuer `https://accounts.webrizen.com/api/auth`). It has an org claim with roles and permissions, a "list org members" endpoint (client credentials), and member-change webhooks. |
| D3 | There's no SSO SDK for Hephaestus, so we integrate with the standard **`openid-client`** library. |
| D4 | Cloud data lives in **Supabase**: Postgres, Storage and Realtime. |
| D5 | The offline edition is **standalone**. One host PC acts as the server and other PCs on the office network connect to it. |
| D6 | One codebase in a **monorepo**, because two editions share the UI, API and database schema. |
| D7 | Brand: the **"Forge"** theme (§11). |
| D8 | Payments: **Razorpay** for tenants collecting from their clients. Webrizen bills tenants and sells offline licenses through **PhonePe**. |
| D9 | Open source wherever practical. Hosting starts on free tiers (Vercel + Supabase). |

**Decision to confirm (D10):** the app UI is a **React single-page app built with Vite**, not Next.js.
Next.js pages need a Next.js server. The offline edition must serve the exact same UI from inside a desktop app, and a Vite SPA runs identically in both places. If we ever need a public marketing site, it can be a separate Next.js site.

---

## 2. Architecture

```
                    ┌──────────────────────────── SHARED CODE ────────────────────────────┐
                    │  UI (React SPA)   ·   API (Hono)   ·   core (logic, schema, perms)  │
                    └───────────────┬───────────────────────────────┬─────────────────────┘
                                    │                               │
          ☁️ CLOUD EDITION           ▼                               ▼          💻 OFFLINE EDITION
 ┌──────────────────────────────────────────────┐   ┌──────────────────────────────────────────────┐
 │ Vercel                                        │   │ Host PC — Electron app (tray)                 │
 │  · SPA (static)                               │   │  · Hono API + serves the SPA  (:4780)         │
 │  · Hono API (serverless function)             │   │  · PGlite  (embedded Postgres, data folder)   │
 │ Supabase                                      │   │  · Files   (local folder)                     │
 │  · Postgres  (via connection pooler)          │   │  · Realtime (built-in WebSocket)              │
 │  · Storage   (files)                          │   │  · Backups (daily, rotating)                  │
 │  · Realtime  (chat, live updates)             │   │  · mDNS broadcast "hephaestus.local"          │
 │  · pg_cron → calls /api/cron (reminders, …)   │   └───────────────────────┬──────────────────────┘
 │ Webrizen SSO (login, orgs, members)           │                           │ office network
 │ Razorpay · Resend (email)                     │     ┌─────────────────────┴───────────────────┐
 └──────────────────────────────────────────────┘     │ Other PCs: Hephaestus app ("Connect")     │
                                                      │ or any browser → http://hephaestus.local │
                                                      └──────────────────────────────────────────┘
```

**The key idea is adapters.** Business logic never talks to Supabase or the local disk directly. It talks to small interfaces, and each edition plugs in its own implementation:

| Interface | Cloud adapter | Offline adapter |
|---|---|---|
| `Database` | Drizzle → Supabase Postgres | Drizzle → PGlite (same schema, same migrations) |
| `FileStore` | Supabase Storage (signed URLs) | Local folder (served by the API) |
| `Realtime` | Supabase Realtime channels | WebSocket server in the host app |
| `Auth` | Webrizen SSO (OIDC) | Local accounts (scrypt-hashed passwords) |
| `Mailer` | Resend | Optional SMTP; if not configured, notifications are in-app only |
| `Jobs` | pg_cron pinging `/api/cron` | In-process scheduler |
| `Payments` | Razorpay (per-tenant keys) | Razorpay if online, plus manual payment recording (cash, UPI, bank) |

---

## 3. Tech stack

| Layer | Choice | License |
|---|---|---|
| Language | TypeScript (strict) everywhere | — |
| Monorepo | pnpm workspaces + Turborepo | MIT |
| UI | React + Vite, TanStack Router, TanStack Query | MIT |
| Components | Tailwind CSS + shadcn/ui (Radix) | MIT |
| Forms and validation | react-hook-form + zod (the same zod schemas are reused by the API) | MIT |
| Rich text / comments | TipTap | MIT |
| Kanban drag and drop | dnd-kit | MIT |
| Charts | Apache ECharts | Apache-2.0 |
| API | Hono (runs on Vercel and inside Electron) | MIT |
| ORM / migrations | Drizzle ORM + drizzle-kit | Apache-2.0 |
| Cloud DB / files / realtime | Supabase | Apache-2.0 |
| Offline DB | PGlite (Postgres compiled to WASM) | Apache-2.0 |
| Desktop shell | Electron + electron-builder + electron-updater | MIT |
| LAN discovery | bonjour-service (mDNS) | MIT |
| SSO client | openid-client + jose | MIT |
| PDFs (invoices) | @react-pdf/renderer | MIT |
| Email templates | React Email | MIT |
| Testing | Vitest, Playwright | MIT |
| CI | GitHub Actions | — |

---

## 4. Repository layout

```
hephaestus/
├─ apps/
│  ├─ web/            React SPA (the whole product UI, used by both editions)
│  ├─ cloud/          Vercel entry: mounts the API with cloud adapters; SSO routes; webhooks; cron
│  └─ desktop/        Electron: host/client mode, tray, PGlite, local files, WebSocket, backups, updater, installer
├─ packages/
│  ├─ core/           Domain logic per pillar, permissions catalogue, zod schemas, adapter interfaces
│  ├─ db/             Drizzle schema + migrations (one source for Supabase and PGlite)
│  ├─ api/            Hono routes (edition-agnostic; receives adapters)
│  ├─ ui/             Forge design system: tokens, shadcn components, icons, logo
│  └─ config/         tsconfig, eslint, tailwind presets
├─ docs/              ARCHITECTURE.md · DECISIONS.md · RUNBOOK.md · OFFLINE-SETUP.md
├─ PLAN.md
└─ .github/workflows/
```

---

## 5. Identity, tenancy and permissions

### 5.1 Cloud login (Webrizen SSO)

```
1. User opens app.hephaestus… → no session → /api/auth/login
2. Redirect to accounts.webrizen.com (Authorization Code + PKCE, scopes: openid profile email organization offline_access)
3. Callback → exchange code → verify ID token (JWKS) → read sub + org {id, roles, permissions}
4. Store an encrypted, HTTP-only session cookie (A256GCM via jose)
5. Access token expires (1 h) → silent refresh → roles/permissions stay fresh
6. Logout → end the local session + SSO end-session
```

- **Org switching:** go through login again with `prompt=select_account`.
- **People directory:** the org member list comes from the SSO's **list org members** endpoint, cached in a `members` table. **Webhooks** (HMAC-verified) keep it current, and there's a full re-sync on login and nightly.
- **No org yet:** users whose `org` claim is null see a *"Create your organization / ask for an invite"* screen that links to the SSO.

### 5.2 Supabase token bridge (cloud only)

The browser talks to Supabase directly only for **Realtime** and **file uploads/downloads**. For that:

- `/api/supabase-token` mints a **10-minute JWT** signed with the Supabase project's signing key. Claims: `sub` = SSO user id, `role` = `authenticated`, `org_id`.
- Realtime channel and Storage policies check `org_id` from that token.
- All other data access goes through our API.

### 5.3 Tenancy

- **Every** table has `org_id`. The API resolves the org from the session and uses an `orgScoped(db, orgId)` helper, so no query can forget the filter.
- **Supabase RLS** is enabled on all tables as defense-in-depth. The API uses a server role, and the browser never gets direct table access.
- **Offline:** the same schema, with exactly one org row per install.

### 5.4 Permissions

Checks are always by **permission**, never by role name, so roles can change without code changes. The Hephaestus permission catalogue (registered in Webrizen SSO as this app's resources):

| Resource | Actions |
|---|---|
| `employee` | read, create, update, archive |
| `department` | read, manage |
| `leave` | read, request, approve |
| `project` | read, create, update, archive |
| `task` | read, create, update, assign, delete |
| `channel` | read, create, manage |
| `client` | read, create, update |
| `invoice` | read, create, update, send, void |
| `payment` | read, record, refund |
| `report` | read_work, read_finance |
| `settings` | manage |

**Offline:** the same catalogue, with a built-in role editor (Owner, Admin, Manager, Member, Accountant presets).

---

## 6. Data model (by pillar)

Conventions for all tables:
- Primary key is a UUID v7.
- Columns `org_id`, `created_at`, `updated_at`, `created_by`, `deleted_at` (soft delete).
- Money is stored as integer paise plus a `currency` column.

**Foundation**
- `orgs` (cloud: mirrors the SSO org)
- `members` (user id, name, email, avatar, status)
- `org_settings` (terminology renames, enabled pillars, branding)
- `audit_events`
- `attachments`
- `notifications`
- `custom_field_defs`, `custom_field_values`
- `sequences` (numbering for invoices and similar)
- `local_users` (offline edition only)

**People**
- `departments` (tree)
- `teams`, `team_members`
- `employees`: linked to `members`, with job title, manager, joining date, type, and status
- `employee_documents`
- `onboarding_templates`, `onboarding_runs` (these generate tasks)
- `leave_types`, `leave_requests`
- `holidays`

**Work**
- `goals`
- `projects`
- `project_members`
- `workflows`, `workflow_stages` (custom stages per project)
- `milestones`
- `tasks`: parent task, stage, assignees, priority, dates, estimate, position
- `task_assignees`
- `task_dependencies`
- `labels`, `task_labels`
- `task_templates`
- `time_entries` (v2)

**Collaboration**
- `threads`: polymorphic, attached to any object (task, project, client, invoice, employee)
- `channels`, `channel_members`
- `messages`: rich text, `thread_id` or `channel_id`, edited/deleted flags
- `message_reactions`
- `mentions`
- `decisions` (a message marked as a decision)
- `read_receipts`

**Finance**
- `clients`, `client_contacts`
- `tax_rates` (GST: CGST/SGST/IGST)
- `items` (services, with HSN/SAC codes)
- `quotes`, `quote_lines`
- `invoices`, `invoice_lines`: linked to project/milestone; status draft → sent → partially_paid → paid / overdue / void
- `recurring_invoices` (retainers: schedule plus template)
- `payments`: gateway or manual, with allocations to invoices
- `credit_notes`
- `payment_gateways` (per-tenant Razorpay keys, encrypted with AES-GCM)
- `reminders`

**SaaS / licensing**
- `subscriptions` (cloud: plan and pillar add-ons, PhonePe references)
- `licenses` (offline edition only: activated license file)

---

## 7. Pillar feature scope

### People
- Employee directory with profiles, departments tree, teams and reporting lines (org chart)
- Onboarding checklists, which turn into tasks automatically
- Leave requests and approvals, holiday calendar, and an availability view feeding the workload view
- Employee documents with role-restricted access

### Work
- Goals → Projects → Milestones → Tasks → Subtasks
- Custom stages per project (for example Idea → In progress → Review → Done)
- Views: **Kanban**, **list**, **calendar**, **My work**, and a manager **workload** heatmap
- Assignees, priority, labels, due dates, dependencies, templates, recurring tasks
- Activity history on every task

### Collaboration
- Comment threads on any object, with @mentions, attachments, reactions and "mark as decision"
- Team channels and direct messages
- Realtime typing and presence, and live board updates
- Notifications: in-app, plus email in the cloud; a digest option

### Finance
- Clients, quotes → invoices, GST-compliant PDF invoices, credit notes
- **Milestone billing:** completing a milestone creates a draft invoice
- Recurring retainers
- Razorpay payment links and webhooks, partial payments, automatic reminders, receipts
- Dashboards: billed vs collected, aging, and per-client and per-project revenue

### Cross-cutting
- Global search (Postgres full-text search, the same in both editions)
- Custom fields, renameable terms ("Project" → "Case" / "Job"), and industry templates
- CSV import/export, and a full audit log

---

## 8. Offline edition details

**Setup experience, aimed at non-technical users:**
1. Download and run `Hephaestus-Setup.exe` (Windows is the priority; macOS and Linux later).
2. The first-run wizard asks: **"Is this the main (server) PC?"**
   - **Yes:** create the organization and owner account, choose the data folder, and enter the license key. Windows then asks to allow network access once.
   - **No:** the app finds the server on the network automatically (mDNS). If it can't, the user types the address shown on the server PC.
3. Done. Other staff can also use any browser at `http://hephaestus.local:4780`.

**Host behaviour:**
- It runs in the system tray and starts with Windows.
- It warns if the host PC is about to shut down while others are connected.

**Backups:**
- Daily automatic snapshot to a chosen folder, keeping the last 14.
- One-click **Backup now** and **Restore** in settings.
- Export to a `.hephaestus` file to move to a new PC.

**Updates:** `electron-updater` from GitHub Releases, checked when the PC is online. The database migrates automatically, with a backup taken before every migration.

**Licensing:**
- A license file signed by Webrizen (Ed25519) contains the org name, seat count and expiry.
- It's verified offline, so no internet is needed after purchase.
- Licenses are bought and paid through PhonePe on Webrizen's site.

**Network security:**
- In v1, office-network traffic is plain HTTP, protected by local logins and a per-install secret. This is acceptable only on a trusted office network, and the setup screen says so.
- v2 adds a self-signed certificate that the desktop client pins on first connect.

**Limits we accept:**
- No online payments while the host PC is offline; payments can still be recorded manually.
- Email notifications need SMTP settings.

---

## 9. Security

- Tenant isolation through `orgScoped()` in the API plus Supabase RLS. Tests prove that org A can never read org B.
- The SSO session cookie is encrypted, HTTP-only, Secure and SameSite=Lax. SSO login uses PKCE and exact redirect URIs.
- Webhooks (SSO, Razorpay) are verified by HMAC signature, and duplicate deliveries are ignored.
- Tenant Razorpay secrets are encrypted at rest. Nothing secret is ever sent to the browser.
- Security headers: CSP, `frame-ancestors 'none'`, `nosniff`, Referrer-Policy and HSTS.
- Rate limiting on the API, and file uploads restricted by size and type (no SVG uploads).
- Audit log for all sensitive actions: permissions, finance, and exports.
- The Electron app has `contextIsolation` on, `nodeIntegration` off, a sandboxed renderer, and the API listening only on the ports it needs.

---

## 10. Phases

Each phase ends with a demo for your review before the next begins.

| Phase | Scope | Result you can try |
|---|---|---|
| **0. Foundation** | Monorepo, Forge design system, adapter interfaces, Drizzle and first migrations, Hono API skeleton, cloud SSO login and session, Supabase token bridge, org/member sync (list endpoint + webhooks), app shell (sidebar, org header, command palette, dark/light), audit log, file uploads, CI, deploy to Vercel + Supabase | Log in with a Webrizen account and see the empty Hephaestus shell |
| **1. People** | Employees, departments, teams, org chart, profiles, onboarding checklists, leave and holidays, permissions enforcement | Build your company structure |
| **2. Work** | Goals, projects, custom stages, milestones, tasks and subtasks, Kanban, list, calendar, My work, workload, templates | Run real projects |
| **3. Collaboration** | Threads on everything, mentions, reactions, decisions, channels and DMs, realtime, notifications (in-app and email) | Talk inside the work |
| **4. Finance** | Clients, GST settings, quotes, invoices and PDF, milestone billing, retainers, Razorpay links and webhooks, manual payments, reminders, dashboards | Bill and collect |
| **5. Offline edition** | Electron app, host/client modes, PGlite, local files and WebSocket, local accounts and role editor, backups and restore, license activation, Windows installer, auto-update | Install on 2 office PCs and work without internet |
| **6. SaaS layer** | Plans and per-pillar add-ons, PhonePe billing, trials, usage limits, internal admin view | Sell Hephaestus |
| **7. Platform** | Public REST API + API keys, outgoing webhooks, custom fields UI, industry templates, automations ("when X then Y"), CSV import/export | Integrate with other software |
| **Later** | Time tracking, Gantt, client portal, mobile app, cloud ↔ offline sync | — |

**Why offline is phase 5 and not last:** every phase from 0 to 4 is built on the adapters, so the offline edition mostly means writing the offline adapters and the desktop shell. Doing it after Finance proves the architecture early, before the SaaS and platform layers grow.

---

## 11. Brand: "Forge"

**Logo:** the node mark in `logo.png`, black on light and Ash on dark.

| Token | Hex | Use |
|---|---|---|
| Obsidian | `#121110` | Dark background, logo black |
| Forge | `#1E1B18` | Dark surfaces and cards |
| Ash | `#F5F1EA` | Light background, text on dark |
| **Ember** | `#FF5A1F` | Primary accent, buttons, focus, Work pillar |
| Molten | `#C2410C` | Ember variant for text and links on light backgrounds |
| Brass | `#C8A24A` | Finance pillar, premium highlights |
| Patina | `#2E8B6E` | People pillar, success |
| Steel | `#4C6E9E` | Collaboration pillar, info |
| Slag | `#D7263D` | Danger, errors |

- **Typography:**
  - **Bricolage Grotesque** for headings and big numbers
  - **Geist** for interface and body text
  - **Geist Mono** for IDs, amounts and codes

  All three are open source (SIL OFL) and self-hosted in the app, so they work offline.
- **Design:**
  - dark-first, with a full light mode
  - every text/background pair meets WCAG AA
  - generous spacing, 12 px card radius, subtle motion
  - keyboard-first (a ⌘K command palette everywhere)

---

## 12. What you need to do

| When | Item |
|---|---|
| Before Phase 0 | Create a **Supabase** project (Hephaestus) and a **Vercel** project; decide the cloud domain (for example `hephaestus.webrizen.com`) |
| Before Phase 0 | Register Hephaestus in **Webrizen SSO**: redirect URI, client id and secret, permission catalogue (§5.4), webhook URL and signing secret |
| Before Phase 0 | Create a private GitHub repo |
| Phase 3 | A **Resend** account and domain DNS (SPF/DKIM) for email |
| Phase 4 | A **Razorpay** test-mode account for development |
| Phase 5 | A **Windows code-signing certificate** (paid), so the installer doesn't show "Unknown publisher" |
| Phase 6 | A **PhonePe** merchant account for subscriptions and licenses |
| Before launch | A lawyer's review of Terms, Privacy Policy (DPDP Act), and GST invoice format |
| Before launch | Upgrade from free tiers (Vercel Hobby is non-commercial; free Supabase projects pause when idle) |

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| PGlite is younger than regular Postgres | Keep all SQL portable; run the full test suite against both engines in CI. The fallback is `embedded-postgres` (real Postgres binaries) with no schema changes. |
| Free-tier limits (cold starts, pausing, 500 MB DB) | Fine for building; upgrade before paying customers |
| Two editions drift apart | Shared `core` and `api`; CI runs the E2E suite against both editions |
| Offline host PC failure means data loss | Daily automatic backups, backup reminders, and export/restore |
| Team of two | Strict phase scope, docs as we go, and automated tests on critical flows |

---

## 14. Approval checklist

- [ ] Two editions and the architecture (§2)
- [ ] **D10:** Vite React SPA instead of Next.js for the app UI
- [ ] Monorepo layout (§4)
- [ ] Phase order (§10)
- [ ] Forge brand (§11)

Approved 2026-09-30. Phase 0 is in progress.
