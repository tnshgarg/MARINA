import { SkelBar, SkelRow } from '@/components/skeletons'

export default function Loading() {
  return (
    <div className="fade-in">
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <SkelBar w={240} h={28} />
          <SkelBar w={420} h={12} />
        </div>
        <SkelBar w={70} h={40} />
      </div>
      <section className="app-card">
        <div>
          <SkelRow />
          <SkelRow />
          <SkelRow />
          <SkelRow />
          <SkelRow />
        </div>
      </section>
    </div>
  )
}
