import { SkelBar, SkelCard } from '@/components/skeletons'

export default function Loading() {
  return (
    <div className="fade-in">
      <div className="mb-6 space-y-2">
        <SkelBar w={240} h={28} />
        <SkelBar w={420} h={12} />
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-7">
          <SkelCard rows={3} />
        </div>
        <div className="col-span-12 lg:col-span-5">
          <SkelCard rows={4} />
        </div>
      </div>
    </div>
  )
}
