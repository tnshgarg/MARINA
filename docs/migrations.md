# Database Migrations

## Why this matters

We use Drizzle ORM with **versioned SQL migrations**, not `db:push`. Running
`db:push` against production rewrites tables without a change log and can
silently drop columns. The first customer schema change is enough to lose
data.

## The two commands

```bash
# Generate a new migration after editing lib/db/schema.ts
pnpm db:generate

# Apply pending migrations against $DATABASE_URL
pnpm db:migrate
```

`db:generate` writes a numbered SQL file to `./drizzle/`. Commit those files
to git — they are the durable record of every schema change.

`db:migrate` runs in CI/CD before the app boots. It scans `./drizzle/` and
applies any unapplied migrations in order. Idempotent: applied migrations
are tracked in a `__drizzle_migrations__` table.

## Bootstrap: first time

The repository should contain a baseline migration captured from the current
schema. To generate it after pulling fresh:

```bash
pnpm db:generate
# review the output, then commit:
git add drizzle/
git commit -m "init: baseline schema migration"
```

## Production deploy

Vercel example — add to `vercel.json`:

```json
{
  "buildCommand": "pnpm db:migrate && next build"
}
```

This runs migrations before the new code is shipped. If migrate fails, the
deploy fails — you'll see it in the Vercel build logs, no half-state.

## What NOT to do

- ❌ `pnpm db:push` against production
- ❌ Edit applied migration files (write a new migration instead)
- ❌ Skip the review of generated SQL before committing — Drizzle sometimes
  reorders columns or renames in ways you didn't intend
- ❌ Run `db:migrate` from a developer laptop against production DB
