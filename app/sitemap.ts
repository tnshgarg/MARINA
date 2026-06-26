import type { MetadataRoute } from 'next'
import { ARTICLES } from '@/lib/help/articles'

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://marina.team'

/** Public, crawlable routes only — the app (org/dashboard/settings) is gated. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/individuals`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/help`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/setup-guide`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/security`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]
  const helpRoutes: MetadataRoute.Sitemap = ARTICLES.map((a) => ({
    url: `${SITE_URL}/help/${a.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }))
  return [...staticRoutes, ...helpRoutes]
}
