'use client'

import { useState } from 'react'

/**
 * Hero product-demo video. A lightweight "lite-youtube" facade: we show the
 * thumbnail + a play button (fast, no YouTube JS on load) and only mount the
 * autoplaying iframe once the visitor clicks. Wrapped in the same floating
 * brand frame as the other hero mocks so it reads as part of the product, not a
 * pasted-in embed.
 */
export function HeroVideo({
  videoId = 'x0gcvw68M8I',
  title = 'Marina product demo',
  label = 'Watch the 2-minute demo',
}: {
  videoId?: string
  title?: string
  label?: string
}) {
  const [playing, setPlaying] = useState(false)

  return (
    <div className="relative">
      {/* Floating gradient glow — matches the other hero accents. */}
      <div
        aria-hidden
        className="absolute -inset-5 rounded-[26px] -z-10 m-float"
        style={{
          background:
            'linear-gradient(135deg, rgba(63,107,84,0.16) 0%, rgba(196,123,86,0.10) 50%, rgba(193,154,77,0.12) 100%)',
        }}
      />
      <div className="relative aspect-video rounded-[18px] overflow-hidden bg-[var(--m-ink)] border border-[var(--m-border)] shadow-[var(--m-shadow-xl)]">
        {playing ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play: ${title}`}
            className="group absolute inset-0 h-full w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`}
              alt=""
              aria-hidden
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
              onError={(e) => {
                // Not every video has a maxres thumbnail — fall back to hq.
                const img = e.currentTarget
                if (!img.src.includes('hqdefault')) img.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
              }}
            />
            <span aria-hidden className="absolute inset-0 bg-black/30 transition-colors group-hover:bg-black/20" />
            {/* Play button */}
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 inline-flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-[0_8px_28px_-6px_rgba(0,0,0,0.4)] transition-transform group-hover:scale-105"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="var(--m-accent-2)">
                <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
              </svg>
            </span>
            {/* Label chip */}
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-medium text-white backdrop-blur-sm">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--m-good)]" />
              {label}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
