# UOA OS

Internal firm operating system for UOA Legal (immigration practice). It tracks every matter from first inquiry to closed file, with attorney approval gates and deadline control.

Project context, rules and decisions: see [CLAUDE.md](CLAUDE.md) and [docs/](docs/).

## Rules that apply to every change

- **No real personal data** in code, tests, seed data, logs or commits. Use synthetic Matters A, B and C only.
- **Secrets only in `.env.local`**, never committed. Keep `.env.example` up to date.
- Database changes go through SQL migrations in `supabase/migrations/`.

## Getting started

Requires Node 24 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev                  # http://localhost:3000
```

If `npm run dev` or `npm run build` fails with "failed to rename file ... os error 32", a file-locking driver on the machine is blocking Turbopack's disk cache. Turn the cache off with `NEXT_DISABLE_FS_CACHE=1` (in `.env.local` or the shell).

## Supabase

- Create a project at supabase.com (U.S. region). Copy the URL and keys from **Project Settings → API** into `.env.local`.
- In **Authentication → Providers**, turn off "Allow new users to sign up" (staff are invited, never self-registered).
- In **Authentication → Multi-Factor**, turn on **TOTP (authenticator app)**.
- `supabase/config.toml` holds the same settings for the local Supabase CLI.
- Code helpers: `src/lib/supabase/client.ts` (browser), `server.ts` (server), `proxy.ts` (session refresh and login/MFA redirects, used by `src/proxy.ts`).

## What Increment 1 does

Matter Tracker with Deadline Control (decision #7):

| Screen | What it is for |
|---|---|
| Dashboard (`/`) | Sign-off queue (where the attorney is needed), deadlines in the next 30 days, open matters by stage, stalled matters, my tasks |
| Matters, New matter | Intake (stage 1) and the list of all matters |
| Matter page | Stages 1–11 with exit gates, attorney approvals, notices, deadlines, filings, response cycles, parties, appearances, checklist, history |
| Weekly sweep | Weekly online check of every pending USCIS case and EOIR or federal matter (redline 9) |
| Deadline rules | The attorney verifies each rule (D7) |
| Staff, Account | The principal adds people and sets roles; everyone changes their own password |
| Settings | Open decisions as settings (principal only) |
| Export | Every table as CSV (attorney and principal) |

The rules live in the database (`supabase/migrations/20261104000100_matters.sql`), not only in the screens:
attorney gates at stages 2, 3, 5 and 6 (R3), every notice gets a deadline or an attorney "no deadline" (R1),
no closing with an open deadline or appearance (R4), every change in the append-only event log, nothing deleted.

Due dates are computed in one module: `src/lib/deadlines.ts` (weekends, federal holidays, mailing extension, appointments, reminders), tested in `src/lib/deadlines.test.ts`.

Reminders (R2): `/api/cron/escalations` runs daily (`vercel.json`). It also alerts once when a matter's engagement is not signed by its alert date. It needs `CRON_SECRET`, and `EMAIL_API_KEY`/`EMAIL_FROM` to really send.

## Applying database changes

Migrations in `supabase/migrations/` are applied in order. Without the Supabase CLI linked, paste a migration into **Supabase → SQL Editor** and run it, then record it:
`insert into supabase_migrations.schema_migrations (version, name) values ('<timestamp>', '<name>');`

Synthetic demo data: `supabase/seed/matters_abc.sql` (Matters A, B and C; safe to run twice; dev and test only).

## Adding a staff member

The principal opens **Staff**, enters the name, work email and role, and gives the one-time temporary password to the person in person or by phone. They sign in, set up the authenticator app, and change the password on **Account** (click your name). Access is switched off, never deleted.

## Checks

```bash
npm run lint
npm run typecheck
npm test          # deadline module unit tests
npm run test:db   # database rules (needs a local Postgres 17; uses PG* env variables)
npm run build
```

CI runs all of these on every push to `main` and on every pull request.
