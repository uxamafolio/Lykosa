# Lykosa Free Deployment

Recommended $0 setup:

- Vercel Hobby for the Next.js dashboard and API routes
- Supabase Free for Postgres
- GitHub Actions schedule for the hunter job
- Telegram Bot API for lead alerts

## 1. Supabase

Create a Supabase project and copy both database URLs:

- `DATABASE_URL`: pooled connection string for runtime traffic
- `DIRECT_URL`: direct connection string for Prisma migrations, or Supabase session pooler on port `5432`

The Prisma schema is already configured for Postgres/Supabase.

## 2. Local Environment

Copy `.env.example` to `.env` locally:

```bash
cp .env.example .env
```

Set:

```bash
DATABASE_URL=...
DIRECT_URL=...
BASIC_AUTH_USER=...
BASIC_AUTH_PASSWORD=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
HUNTER_SCHEDULE_MINUTES=15
ZAI_BASE_URL=...
ZAI_API_KEY=...
ZAI_CHAT_ID=...
ZAI_USER_ID=...
```

Create the local SDK config before testing the hunter:

```bash
bun run zai:config
```

## 3. Initialize Supabase Schema

After `DATABASE_URL` and `DIRECT_URL` point to Supabase:

```bash
bun install
bun run db:generate
bun run db:deploy:direct
```

Run this once locally, or manually from GitHub Actions with the same secrets configured.

If you are prototyping and want to push the current Prisma schema without migrations, use the direct helper:

```bash
bun run db:push:direct
```

Do not run `bunx prisma db push` against Supabase's transaction pooler on `pooler.supabase.com:6543`. The transaction pooler can raise:

```text
ERROR: prepared statement "s1" already exists
```

Schema changes should use `DIRECT_URL`, while the deployed app can keep `DATABASE_URL` on the pooled connection.

Valid `DIRECT_URL` shapes:

```bash
# Direct connection, if your network supports IPv6
DIRECT_URL="postgresql://postgres:ENCODED_PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres"

# Session pooler, useful when direct IPv6 is unavailable
DIRECT_URL="postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
```

If Prisma returns `P1000`, reset/copy the database password from Supabase Project Settings -> Database. This is not your Supabase account password, anon key, or service-role key. URL-encode the password before putting it in the connection string.

## 4. Vercel Web App

Import the GitHub repo into Vercel.

Framework preset:

```text
Next.js
```

Build command:

```bash
bun run build
```

Environment variables in Vercel:

```bash
DATABASE_URL=...
DIRECT_URL=...
BASIC_AUTH_USER=...
BASIC_AUTH_PASSWORD=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

Telegram values are optional for the web app itself, but setting them lets the dashboard show whether Telegram is configured. GitHub Actions is what actually sends alerts.

Optional health check path:

```text
/api/health
```

## 5. GitHub Actions Hunter Schedule

Add these GitHub repository secrets:

```bash
DATABASE_URL
DIRECT_URL
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
ZAI_BASE_URL
ZAI_API_KEY
ZAI_CHAT_ID
ZAI_USER_ID
```

The scheduled workflow runs:

```bash
bun run zai:config
bun run worker:hunter:once
```

It runs one hunter cycle, saves listings to Supabase, sends Telegram alerts, then exits. The schedule is defined in `.github/workflows/hunter.yml`.

The current schedule is every 15 minutes:

```yaml
cron: "*/15 * * * *"
```

## 6. GitHub Actions CI

The CI workflow checks the project on pushes and PRs:

```bash
bun run lint
bunx tsc --noEmit
bun run build
```

Vercel can deploy automatically from GitHub after the branch updates.

## Security Note

The current local `.env` has been tracked by Git before. Remove it from the index before pushing and rotate any exposed Telegram token:

```bash
git rm --cached .env
```

Do not commit `.env`; commit `.env.example` instead.
