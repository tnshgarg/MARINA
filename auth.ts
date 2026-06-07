import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import Credentials from 'next-auth/providers/credentials'
import { db, schema } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { consumeMagicToken } from '@/lib/auth/magic'
import { syncUserActivity } from '@/lib/github/sync'

type MarinaTokenFields = {
  accessToken?: string
  appUserId?: number
  login?: string
}

async function pickUniqueLogin(base: string): Promise<string> {
  const cleaned = (base || 'user').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'user'
  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = attempt === 0 ? cleaned : `${cleaned}${attempt + 1}`
    const exists = await db.query.users.findFirst({ where: eq(schema.users.login, candidate) })
    if (!exists) return candidate
  }
  // Fall back to a random suffix in the extremely unlikely case of 25 collisions
  return `${cleaned}-${Math.random().toString(36).slice(2, 8)}`
}

type GhProfile = {
  id: number
  login: string
  name?: string
  email?: string
  avatar_url?: string
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  // Use our own error page so users see a helpful message instead of
  // NextAuth's default "Server error / Configuration" black box.
  pages: {
    error: '/auth/error',
  },
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
      authorization: { params: { scope: 'read:user user:email repo' } },
    }),

    // Email magic-link via Credentials.
    Credentials({
      id: 'magic',
      name: 'Email magic link',
      credentials: {
        token: { label: 'Token', type: 'text' },
      },
      async authorize(credentials) {
        try {
          const token = (credentials?.token as string | undefined)?.trim()
          if (!token) {
            console.warn('[auth/magic] empty token in authorize')
            return null
          }
          const email = await consumeMagicToken(token)
          if (!email) {
            console.warn('[auth/magic] consumeMagicToken returned null — token invalid/expired/missing-table')
            return null
          }
          let user = await db.query.users.findFirst({ where: eq(schema.users.email, email) })
          if (!user) {
            const login = await pickUniqueLogin(email.split('@')[0]!.slice(0, 32))
            const [created] = await db
              .insert(schema.users)
              .values({ email, login, name: null })
              .returning()
            user = created
          }
          return {
            id: String(user.id),
            email: user.email ?? undefined,
            name: user.name ?? null,
            image: user.image ?? user.avatarUrl ?? null,
          }
        } catch (err) {
          // Defensive — NextAuth turns thrown errors into Configuration. Log and return null.
          console.error('[auth/magic] authorize threw:', err)
          return null
        }
      },
    }),

    // Dev-only sign in. Only enabled when NODE_ENV is not 'production'.
    // Lets you sign in as any seeded user instantly for testing.
    Credentials({
      id: 'dev',
      name: 'Dev login',
      credentials: {
        userId: { label: 'User ID', type: 'text' },
      },
      async authorize(credentials) {
        if (process.env.NODE_ENV === 'production') {
          console.warn('[auth/dev] dev login attempted in production — refused')
          return null
        }
        try {
          const userId = Number(credentials?.userId)
          if (!Number.isInteger(userId)) return null
          const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) })
          if (!user) return null
          return {
            id: String(user.id),
            email: user.email ?? undefined,
            name: user.name ?? null,
            image: user.image ?? user.avatarUrl ?? null,
          }
        } catch (err) {
          console.error('[auth/dev] authorize threw:', err)
          return null
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account, profile, user }) {
      const t = token as typeof token & MarinaTokenFields

      try {
        // GitHub sign-in path
        if (account?.provider === 'github' && account?.access_token && profile) {
          const ghProfile = profile as unknown as GhProfile
          const existing = await db.query.users.findFirst({
            where: eq(schema.users.githubId, ghProfile.id),
          })
          const row = existing
            ? (
                await db
                  .update(schema.users)
                  .set({
                    login: ghProfile.login,
                    name: ghProfile.name ?? existing.name,
                    email: ghProfile.email ?? existing.email,
                    avatarUrl: ghProfile.avatar_url ?? existing.avatarUrl,
                    accessToken: account.access_token,
                  })
                  .where(eq(schema.users.id, existing.id))
                  .returning()
              )[0]
            : (
                await db
                  .insert(schema.users)
                  .values({
                    githubId: ghProfile.id,
                    login: ghProfile.login,
                    name: ghProfile.name,
                    email: ghProfile.email,
                    avatarUrl: ghProfile.avatar_url,
                    accessToken: account.access_token,
                  })
                  .returning()
              )[0]
          t.appUserId = row.id
          t.login = row.login
          t.accessToken = account.access_token

          // Auto-sync GitHub activity in the background. We don't await — sign-in
          // must stay snappy. Failures are persisted to users.lastSyncError so
          // managers see what happened on the Activity tab.
          void syncUserActivity(row.id, row.login, account.access_token, 30).catch(async (err) => {
            console.error('[auth] background github sync failed', err)
            try {
              await db
                .update(schema.users)
                .set({ lastSyncError: String(err).slice(0, 500) })
                .where(eq(schema.users.id, row.id))
            } catch (writeErr) {
              console.error('[auth] failed to persist sync error', writeErr)
            }
          })
        }

        // Magic-link & dev paths share the same logic
        if ((account?.provider === 'magic' || account?.provider === 'dev') && user?.id) {
          const numericId = Number(user.id)
          if (Number.isFinite(numericId)) {
            const row = await db.query.users.findFirst({ where: eq(schema.users.id, numericId) })
            if (row) {
              t.appUserId = row.id
              t.login = row.login
              t.accessToken = undefined
            }
          }
        }
      } catch (err) {
        console.error('[auth] jwt callback threw — returning token as-is:', err)
      }

      return t
    },
    async session({ session, token }) {
      const t = token as typeof token & MarinaTokenFields
      session.accessToken = t.accessToken
      session.appUserId = t.appUserId
      session.login = t.login
      return session
    },
  },
})
