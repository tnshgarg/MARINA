# Project MARINA — v1 (Day 1 slice)

AI Workforce Intelligence — track meaningful work output (commits, PRs, reviews) instead of mouse jiggles, and generate AI-written work narratives.

This is the **Day 1 ship target** from the plan: single-user "Work Narrative" web app. No teams, invites, Mac agent, or screenshots yet — those come in later phases.

## What's in this slice

- GitHub OAuth login (NextAuth v5)
- Sync last 7 days of your own commits / PRs opened / reviews given / issues closed
- AI narrative generation with **Groq** (Llama 3.3 70B) and **OpenAI** (gpt-4o-mini)
  - Provider abstraction with automatic fallback when one isn't configured
  - Dashboard toggle to pick either provider per generation
- Dashboard with activity feed, totals, and a Work Narrative card showing signal (High / Steady / Low / Blocked) and inferred blockers

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind
- NextAuth v5 (`next-auth@beta`)
- Drizzle ORM + Neon (Postgres over HTTP)
- `@octokit/rest` for GitHub
- `groq-sdk` + `openai`

## Setup

1. **Database (Neon).** Sign up at https://neon.tech, create a project, copy the connection string.

2. **GitHub OAuth app.** https://github.com/settings/developers → New OAuth App.
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
   - Generate a client secret; copy both ID and secret.

3. **API keys.**
   - Groq: https://console.groq.com (free tier is plenty for v1)
   - OpenAI: https://platform.openai.com/api-keys

4. **Env vars.** Copy `.env.example` to `.env.local` and fill it in. Generate `AUTH_SECRET` with:
   ```sh
   openssl rand -base64 32
   ```

5. **Push schema.**
   ```sh
   pnpm db:push
   ```

6. **Run.**
   ```sh
   pnpm dev
   ```

   Open http://localhost:3000.

## Verification (Day 1 ship criteria)

1. Click "Sign in with GitHub" → OAuth flow → land on `/dashboard`
2. Click "Sync GitHub (7d)" → activity feed populates, totals update
3. Click "Generate" → narrative paragraph + signal + (any) blockers appear
4. Toggle provider between Groq and OpenAI in the dropdown → regenerate → both produce sensible output
5. Sign out → land back on `/`

## Notes on the broader plan

This is the **Day 1** slice. The approved 7-day plan in `~/.claude/plans/hey-this-is-the-piped-finch.md` continues with:
- Day 2–3: multi-tenant orgs + team invites (Resend)
- Day 4–5: Electron menubar agent (active app, idle, paired to web account)
- Day 6: disclosed-randomized screenshots + vision analysis (OpenAI gpt-4o-mini vision); 48h image retention; never shown raw to managers
- Day 7: combined-signal stagnation detection (Blocked / Disengaged / Possibly dummying)

Build in plan order. Don't skip ahead until single-user works end-to-end.

## Deploy

The simplest path:

1. Push this directory to a new GitHub repo.
2. Import into Vercel.
3. Add env vars in the Vercel project settings (same as `.env.local`).
4. Add a second redirect URI on the GitHub OAuth app for your Vercel URL.
5. Deploy.
