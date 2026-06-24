import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db, schema } from '@/lib/db/client'
import { BookingForm } from '@/components/booking-form'

export const dynamic = 'force-dynamic'

/** Public booking page — book time with a Marina user. The viral surface. */
export default async function BookPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const host = await db.query.users.findFirst({ where: eq(schema.users.login, handle) })
  if (!host) notFound()
  const name = host.name ?? `@${host.login}`

  return (
    <main className="min-h-screen paper text-[var(--m-ink)] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" width={26} height={26} alt="" aria-hidden className="block object-contain" />
          <span className="font-display text-[18px] tracking-tight">MARINA</span>
        </div>
        <h1 className="font-display text-[30px] leading-tight tracking-tight text-center">
          Book time with <span className="italic brand-gradient-text">{name}</span>
        </h1>
        <p className="text-center text-[14px] text-[var(--m-ink-3)] mt-2 mb-6">
          Pick a time that works for you and send a request — {name.split(' ')[0]} will confirm.
        </p>
        <BookingForm handle={host.login} hostName={name} />
        <p className="text-center text-[12px] text-[var(--m-ink-4)] mt-5">
          Powered by Marina ·{' '}
          <a href="/" className="underline underline-offset-2 hover:text-[var(--m-ink-2)]">get your own booking link, free</a>
        </p>
      </div>
    </main>
  )
}
