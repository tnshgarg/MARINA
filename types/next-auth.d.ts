import 'next-auth'

declare module 'next-auth' {
  interface Session {
    // accessToken intentionally NOT exposed on the session — the GitHub token
    // is repo-scoped and stays server-side (read from users.accessToken).
    appUserId?: number
    login?: string
  }
}
