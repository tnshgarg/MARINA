import { SkelBar, SkelCard, SkelRow } from '@/components/skeletons'

export default function Loading() {
  return (
    <div className="fade-in">
      <div className="mb-6 space-y-2">
        <SkelBar w={180} h={28} />
        <SkelBar w={300} h={12} />
      </div>
      <SkelCard rows={2} className="mb-6" />
      <div className="app-card">
        <SkelRow />
        <SkelRow />
        <SkelRow />
      </div>
    </div>
  )
}
