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

## Supabase

- Create a project at supabase.com (U.S. region). Copy the URL and keys from **Project Settings → API** into `.env.local`.
- In **Authentication → Providers**, turn off "Allow new users to sign up" (staff are invited, never self-registered).
- In **Authentication → Multi-Factor**, turn on **TOTP (authenticator app)**.
- `supabase/config.toml` holds the same settings for the local Supabase CLI.
- Code helpers: `src/lib/supabase/client.ts` (browser), `server.ts` (server), `proxy.ts` (session refresh and login/MFA redirects, used by `src/proxy.ts`).

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```

CI runs the same three checks on every push to `main` and on every pull request.
