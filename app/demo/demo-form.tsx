'use client'

import { useActionState } from 'react'
import { submitDemoRequest, type DemoFormState } from './actions'

const initial: DemoFormState = { status: 'idle' }

const TEAM_SIZES: Array<{ value: string; label: string }> = [
  { value: '1-5', label: '1–5' },
  { value: '6-20', label: '6–20' },
  { value: '21-50', label: '21–50' },
  { value: '51-200', label: '51–200' },
  { value: '200+', label: '200+' },
]

export function DemoForm() {
  const [state, formAction, pending] = useActionState(submitDemoRequest, initial)

  if (state.status === 'ok') {
    return (
      <div className="rounded-2xl border border-[var(--m-accent)]/40 bg-[var(--m-accent-soft)]/30 p-8 text-center">
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--m-accent)] text-white mb-4">
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
            <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 className="font-display text-[24px] text-[var(--m-ink)] leading-tight">
          You&apos;re on the list.
        </h2>
        <p className="mt-3 text-[14px] text-[var(--m-ink-2)] leading-relaxed max-w-md mx-auto">
          {state.message}
        </p>
        <p className="mt-6 text-[12px] text-[var(--m-ink-3)]">
          In the meantime — <a href="/" className="text-[var(--m-accent-2)] underline underline-offset-2">explore the product</a> or{' '}
          <a href="/download" className="text-[var(--m-accent-2)] underline underline-offset-2">download the desktop agent</a>.
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field name="name" label="Your name" placeholder="Tanish Garg" required />
        <Field name="email" label="Work email" placeholder="you@company.com" type="email" required />
      </div>
      <Field name="company" label="Company (optional)" placeholder="Acme Inc." />

      <div>
        <label className="block text-[12.5px] font-medium text-[var(--m-ink-2)] mb-2">
          Team size
        </label>
        <div className="grid grid-cols-5 gap-2">
          {TEAM_SIZES.map((s, i) => (
            <label
              key={s.value}
              className="cursor-pointer relative"
            >
              <input
                type="radio"
                name="teamSize"
                value={s.value}
                defaultChecked={i === 1}
                className="peer sr-only"
              />
              <span className="flex items-center justify-center text-[13.5px] py-2.5 rounded-lg border border-[var(--m-border)] bg-white text-[var(--m-ink-2)] peer-checked:bg-[var(--m-accent)] peer-checked:text-white peer-checked:border-[var(--m-accent)] transition">
                {s.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="struggle" className="block text-[12.5px] font-medium text-[var(--m-ink-2)] mb-2">
          What are you struggling with today? <span className="text-[var(--m-ink-4)] font-normal">(optional)</span>
        </label>
        <textarea
          id="struggle"
          name="struggle"
          rows={4}
          placeholder="e.g. Too many status meetings. Blockers slip through. I want to know who's overworking before they burn out."
          maxLength={1000}
          className="w-full rounded-lg border border-[var(--m-border)] bg-white px-3.5 py-3 text-[14px] text-[var(--m-ink)] placeholder:text-[var(--m-ink-4)] focus:outline-none focus:border-[var(--m-accent)] focus:ring-2 focus:ring-[var(--m-accent)]/20 resize-none"
        />
      </div>

      {state.status === 'error' && (
        <p className="text-[13px] text-[var(--m-bad)] bg-[var(--m-bad-soft)]/50 border border-[var(--m-bad)]/20 rounded-lg px-3.5 py-2.5">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full inline-flex items-center justify-center gap-2 bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white font-medium text-[14.5px] px-5 py-3 rounded-lg shadow-[var(--m-shadow)] transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? 'Sending…' : 'Book my demo'}
        {!pending && (
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <p className="text-center text-[11.5px] text-[var(--m-ink-4)]">
        Or skip the demo and <a href="/#cta" className="text-[var(--m-accent-2)] underline underline-offset-2">start free in 30 seconds</a>.
      </p>
    </form>
  )
}

function Field({
  name,
  label,
  placeholder,
  type = 'text',
  required = false,
}: {
  name: string
  label: string
  placeholder?: string
  type?: string
  required?: boolean
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-[12.5px] font-medium text-[var(--m-ink-2)] mb-2">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        autoComplete={
          name === 'email' ? 'email' :
          name === 'name' ? 'name' :
          name === 'company' ? 'organization' : 'off'
        }
        className="w-full rounded-lg border border-[var(--m-border)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--m-ink)] placeholder:text-[var(--m-ink-4)] focus:outline-none focus:border-[var(--m-accent)] focus:ring-2 focus:ring-[var(--m-accent)]/20"
      />
    </div>
  )
}
