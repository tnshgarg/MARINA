import { SkelBar, SkelCard, SkelRow } from '@/components/skeletons'

export default function Loading() {
  return (
    <div className="fade-in">
      <div className="mb-6 space-y-2">
        <SkelBar w={220} h={28} />
        <SkelBar w={300} h={12} />
      </div>
      <div className="space-y-6">
        <SkelCard rows={2} />
        <SkelCard rows={2} />
        <div className="app-card">
          <SkelRow />
          <SkelRow />
          <SkelRow />
        </div>
      </div>
    </div>
  )
}
