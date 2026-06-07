import { SkelBar, SkelRow } from '@/components/skeletons'

export default function Loading() {
  return (
    <div className="fade-in">
      <div className="mb-6 space-y-2">
        <SkelBar w={240} h={28} />
        <SkelBar w={420} h={12} />
      </div>
      <div className="app-card">
        <div className="px-5 py-4 border-b border-slate-100 flex gap-2">
          <SkelBar w={60} h={26} />
          <SkelBar w={80} h={26} />
          <SkelBar w={90} h={26} />
          <SkelBar w={70} h={26} />
        </div>
        <div>
          <SkelRow />
          <SkelRow />
          <SkelRow />
        </div>
      </div>
    </div>
  )
}
