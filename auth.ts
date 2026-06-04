import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { db, schema } from '@/lib/db/client'
import { eq } from 'drizzle-orm'

type MarinaTokenFields = {
  accessToken?: string
  appUserId?: number
  login?: string
}

type GhProfile = {
  id: number
  login: string
  name?: string
  email?: string
  avatar_url?: string
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
      authorization: { params: { scope: 'read:user user:email repo' } },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account, profile }) {
      const t = token as typeof token & MarinaTokenFields
      if (account?.access_token && profile) {
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
