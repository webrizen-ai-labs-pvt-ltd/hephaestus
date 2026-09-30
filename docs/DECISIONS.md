# Decision log

| # | Date | Decision | Why |
|---|---|---|---|
| D1 | 2026-09-30 | Two editions from one codebase: cloud SaaS + standalone offline | Sell as SaaS; some businesses need on-premise, no-internet use |
| D2 | 2026-09-30 | Cloud identity = Webrizen SSO (OIDC), integrated with `openid-client` | Shared login across Webrizen products; no SDK available to this repo |
| D3 | 2026-09-30 | Cloud data/files/realtime on Supabase | Managed Postgres + storage + realtime without building them |
| D4 | 2026-09-30 | All data goes through our Hono API; the browser only touches Supabase for Realtime (short-lived minted JWT) | The same API must run inside the offline edition |
| D5 | 2026-09-30 | One Drizzle schema for Supabase Postgres and PGlite | No separate offline schema to maintain |
| D6 | 2026-09-30 | Vite React SPA instead of Next.js | Same UI must run in Electron without a Next.js server |
| D7 | 2026-09-30 | Monorepo (pnpm + Turborepo) | Two editions share UI, API and schema |
| D8 | 2026-09-30 | Forge brand: Bricolage Grotesque / Geist / Geist Mono; Obsidian, Ash, Ember, Brass, Patina, Steel, Slag | Approved by the owner |
| D9 | 2026-09-30 | Permissions checked by `resource:action`, never role names | Orgs reshape roles in SSO without code changes |
| D10 | 2026-09-30 | Members removed via SSO webhook are blocked at once, even with a live session | Revocation shouldn't wait for token expiry |
| D11 | 2026-09-30 | Deploy with Vercel's Build Output API (one bundled function + static SPA) | Workspace TypeScript packages bundle reliably with esbuild |
| D12 | 2026-09-30 | UUID v7 ids generated in the app | Time-ordered ids; identical behaviour on both database engines |
| D13 | 2026-09-30 | Employees are separate from sign-in accounts (`members`) and linked by work email | HR can add people before they sign in; some staff never need an account |
| D14 | 2026-09-30 | Leave is counted in working days on the server (org work week, non-optional holidays, half days) and checked against the yearly balance, pending included | One source of truth; no over-booking by submitting many requests |
| D15 | 2026-09-30 | Managers approve their direct reports; `leave:approve` approves anyone; nobody approves their own leave | Matches how most Indian SMEs run leave |
| D16 | 2026-09-30 | Onboarding steps live in their own table until Phase 2, then become tasks | Work (tasks) doesn't exist yet; the checklist UX doesn't change |
| D17 | 2026-09-30 | Employee documents: HR (`employee:update`) and the employee only | Documents are usually ID proofs and contracts |
