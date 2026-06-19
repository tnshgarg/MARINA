import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ComponentType } from 'react'
import { ARTICLES, getArticle, type Block, type MockupKey } from '@/lib/help/articles'
import {
  AiBriefMockup,
  AskMarinaMockup,
  BlockerResolverMockup,
  ScrumModeMockup,
  MemberDetailMockup,
  ActivityFeedMockup,
  TeamsMockup,
} from '@/components/landing-showcase'

const MOCKUPS: Record<MockupKey, ComponentType> = {
  aiBrief: AiBriefMockup,
  askMarina: AskMarinaMockup,
  blockerResolver: BlockerResolverMockup,
  scrumMode: ScrumModeMockup,
  memberDetail: MemberDetailMockup,
  activityFeed: ActivityFeedMockup,
  teams: TeamsMockup,
}

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const a = getArticle(slug)
  return { title: a ? `${a.title} · MARINA Help` : 'Help · MARINA' }
}

function BlockView({ b }: { b: Block }) {
  switch (b.type) {
    case 'h':
      return <h2 className="text-[18px] font-semibold text-[var(--m-ink)] mt-7 mb-1">{b.text}</h2>
    case 'p':
      return <p className="text-[14.5px] text-[var(--m-ink-2)] leading-relaxed mt-3">{b.text}</p>
    case 'ul':
      return (
        <ul className="list-disc pl-5 mt-3 space-y-1.5 text-[14px] text-[var(--m-ink-2)] leading-relaxed">
          {b.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )
    case 'steps':
      return (
        <ol className="list-decimal pl-5 mt-3 space-y-1.5 text-[14px] text-[var(--m-ink-2)] leading-relaxed">
          {b.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ol>
      )
    case 'tip':
      return (
        <div className="mt-4 rounded-lg border border-[var(--m-border)] bg-[var(--m-accent-soft)] px-4 py-3 text-[13.5px] text-[var(--m-ink-2)] leading-relaxed">
          <span className="font-semibold text-[var(--m-accent)]">Tip · </span>
          {b.text}
        </div>
      )
    case 'figure': {
      const Mockup = MOCKUPS[b.mockup]
      return (
        <figure className="mt-6">
          <div className="rounded-xl border border-[var(--m-border)] bg-[var(--m-bg-soft)] p-3 sm:p-4 overflow-x-auto">
            <Mockup />
          </div>
          {b.caption && (
            <figcaption className="text-[12px] text-[var(--m-ink-4)] mt-2 text-center">{b.caption}</figcaption>
          )}
        </figure>
      )
    }
    default:
      return null
  }
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const a = getArticle(slug)
  if (!a) notFound()
  const related = ARTICLES.filter((x) => x.category === a.category && x.slug !== a.slug).slice(0, 3)

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 sm:py-14">
      <Link href="/help" className="text-[13px] text-[var(--m-ink-3)] hover:text-[var(--m-ink)] transition-colors">
        ← Help center
      </Link>
      <p className="app-eyebrow mt-6">
        {a.category} · {a.minutes} min read
      </p>
      <h1 className="text-[28px] sm:text-[32px] font-semibold text-[var(--m-ink)] tracking-tight mt-1">{a.title}</h1>
      <div className="mt-4">
        {a.blocks.map((b, i) => (
          <BlockView key={i} b={b} />
        ))}
      </div>

      {related.length > 0 && (
        <div className="mt-12 border-t border-[var(--m-border)] pt-6">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--m-ink-4)] mb-3">
            More in {a.category}
          </p>
          <div className="space-y-2">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`/help/${r.slug}`}
                className="block rounded-lg border border-[var(--m-border)] bg-white px-4 py-3 hover:border-[var(--m-accent)] transition-colors"
              >
                <p className="text-[13.5px] font-medium text-[var(--m-ink)]">{r.title}</p>
                <p className="text-[12px] text-[var(--m-ink-3)] mt-0.5">{r.summary}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
