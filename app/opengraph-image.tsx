import { ImageResponse } from 'next/og'

export const alt = 'MARINA — The AI Chief of Staff for remote teams'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** Branded social-share card (Slack/Twitter/LinkedIn unfurls). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#f8f6f1',
          padding: '72px',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: '#3f6b54',
              color: '#f8f6f1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '40px',
              fontWeight: 700,
            }}
          >
            M
          </div>
          <div style={{ fontSize: '30px', color: '#1a1f2e', letterSpacing: '0.04em', fontWeight: 700 }}>MARINA</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ fontSize: '68px', color: '#1a1f2e', lineHeight: 1.05, maxWidth: '900px' }}>
            See your team without chasing people.
          </div>
          <div style={{ fontSize: '32px', color: '#5e6678', maxWidth: '860px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
            The AI Chief of Staff for remote teams — blockers, briefs and standups, without becoming the bottleneck.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '14px', fontSize: '24px', color: '#3f6b54', fontFamily: 'Helvetica, Arial, sans-serif' }}>
          <span>Auto-detected blockers</span>
          <span style={{ color: '#b8bdcb' }}>·</span>
          <span>4-minute morning brief</span>
          <span style={{ color: '#b8bdcb' }}>·</span>
          <span>Async standups</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
