import { SkelBar, SkelStatTile, SkelCard, SkelRow } from '@/components/skeletons'

export default function Loading() {
  return (
    <div className="fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="space-y-2">
          <SkelBar w={280} h={28} />
          <SkelBar w={360} h={12} />
        </div>
        <div className="flex gap-2">
          <SkelBar w={120} h={32} />
          <SkelBar w={92} h={32} />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 xl:col-span-9 space-y-6">
          <section className="app-card app-card-lg">
            <div className="space-y-2 mb-4">
              <SkelBar w={200} h={16} />
              <SkelBar w={280} h={10} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SkelStatTile />
              <SkelStatTile />
              <SkelStatTile />
              <SkelStatTile />
            </div>
          </section>

          <SkelCard rows={5} />

          <section className="app-card">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <SkelBar w={160} h={16} />
              <SkelBar w={220} h={32} />
            </div>
            <div>
              <SkelRow />
              <SkelRow />
              <SkelRow />
              <SkelRow />
            </div>
          </section>
        </div>

        <aside className="col-span-12 xl:col-span-3 space-y-6">
          <SkelCard rows={3} />
          <SkelCard rows={4} />
          <SkelCard rows={2} />
        </aside>
      </div>
    </div>
  )
}
