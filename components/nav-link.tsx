'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import { fireNavProgress } from './nav-progress'

/**
 * Drop-in <Link> replacement that triggers the top progress bar the
 * instant the user clicks (rather than waiting for the new pathname).
 * This is the single biggest "feel" win for nav between server-rendered
 * pages where React Server Component streaming adds 100-300ms.
 */
export function NavLink(props: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        // Honor consumer onClick first.
        props.onClick?.(e)
        if (e.defaultPrevented) return
        // Only animate normal left-clicks without modifiers.
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        fireNavProgress()
      }}
    />
  )
}
