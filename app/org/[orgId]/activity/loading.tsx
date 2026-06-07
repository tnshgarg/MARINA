import { SkelBar, SkelRow } from '@/components/skeletons'

export default function Loading() {
  return (
    <div className="fade-in">
      <div className="mb-6 space-y-2">
        <SkelBar w={240} h={28} />
        <SkelBar w={360} h={12} />
      </div>
      <div className="app-card">
        <SkelRow />
        <SkelRow />
        <SkelRow />
        <SkelRow />
        <SkelRow />
        <SkelRow />
      </div>
    </div>
  )
}
