import { SkelBar, SkelCard } from '@/components/skeletons'

export default function Loading() {
  return (
    <div className="fade-in max-w-3xl">
      <div className="mb-6 space-y-2">
        <SkelBar w={160} h={28} />
        <SkelBar w={280} h={12} />
      </div>
      <div className="space-y-6">
        <SkelCard rows={2} />
        <SkelCard rows={3} />
        <SkelCard rows={2} />
        <SkelCard rows={2} />
      </div>
    </div>
  )
}
