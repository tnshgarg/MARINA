import { SkelBar, SkelCard } from '@/components/skeletons'

export default function Loading() {
  return (
    <div className="fade-in">
      <div className="mb-6 space-y-2">
        <SkelBar w={200} h={28} />
        <SkelBar w={300} h={12} />
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 md:col-span-6"><SkelCard rows={5} /></div>
        <div className="col-span-12 md:col-span-6"><SkelCard rows={5} /></div>
      </div>
    </div>
  )
}
