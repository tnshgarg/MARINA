import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://marina.team'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Keep the gated app + APIs out of the index (they redirect to login
        // anyway). Marketing, help, and legal stay crawlable.
        disallow: ['/api/', '/org/', '/dashboard', '/settings', '/me/', '/admin/', '/onboarding', '/invite/', '/scrum/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
