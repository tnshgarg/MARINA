const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://marina.team'

/**
 * Organization + SoftwareApplication JSON-LD for the landing page. Server
 * component — emitted into the initial HTML so crawlers and rich results pick
 * it up. Keep claims accurate.
 */
export function LandingStructuredData() {
  const json = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'MARINA',
        legalName: 'Project MARINA Private Limited',
        url: SITE_URL,
        logo: `${SITE_URL}/logo.png`,
        description: 'The AI chief of staff for remote engineering teams.',
        foundingDate: '2026',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#software`,
        name: 'MARINA',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web, macOS',
        url: SITE_URL,
        description:
          'MARINA is the AI chief of staff for remote engineering teams — auto-detected blockers, a 4-minute morning brief, async standups, attendance and recognition.',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          description: 'Free for your first 5 teammates. No credit card required.',
        },
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
    ],
  }
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  )
}
