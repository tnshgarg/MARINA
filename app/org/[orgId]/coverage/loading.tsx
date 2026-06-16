import { SkelBar, SkelRow } from '@/components/skeletons'

export default function Loading() {
  return (
    <div className="fade-in">
      <div className="mb-5 space-y-2">
        <SkelBar w={220} h={28} />
        <SkelBar w={400} h={12} />
      </div>
      <div className="space-y-5">
        <section className="app-card">
          <div className="px-5 py-3 border-b border-[var(--m-border-soft)]">
            <SkelBar w={140} h={14} />
          </div>
          <div>
            <SkelRow />
            <SkelRow />
            <SkelRow />
          </div>
        </section>
        <section className="app-card">
          <div className="px-5 py-3 border-b border-[var(--m-border-soft)]">
            <SkelBar w={140} h={14} />
          </div>
          <div>
            <SkelRow />
            <SkelRow />
          </div>
        </section>
      </div>
    </div>
  )
}
