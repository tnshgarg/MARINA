import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MARINA',
    short_name: 'MARINA',
    description: 'The AI chief of staff for remote teams.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f8f6f1',
    theme_color: '#3f6b54',
    icons: [
      {
        src: '/logo.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
