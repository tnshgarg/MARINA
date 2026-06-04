import 'next-auth'

declare module 'next-auth' {
  interface Session {
    accessToken?: string
    appUserId?: number
    login?: string
  }
}
