import { useTranslation } from 'react-i18next'
import { BUCKETS, BUCKET_META, carBucket } from '../utils/carStatus'

/** Horizontally-scrollable status filter: count chips (All / Loaded / Not loaded / Arrived). */
export default function StatusFilter({ cars, active, onChange }) {
  const { t } = useTranslation()
  const counts = { all: cars.length, loaded: 0, notLoaded: 0, arrived: 0 }
  cars.forEach((c) => { counts[carBucket(c.status)]++ })

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 mb-6 sm:mx-0 sm:px-0 [scrollbar-width:none]">
      {BUCKETS.map((b) => {
        const meta = BUCKET_META[b]
        const selected = active === b
        return (
          <button
            key={b}
            onClick={() => onChange(b)}
            aria-pressed={selected}
            className={`shrink-0 min-w-[96px] rounded-2xl border px-3.5 py-3 text-left transition-all cursor-pointer active:scale-[0.97] ${
              selected ? `bg-white/[0.06] ${meta.ring}` : 'border-white/5 bg-dark-800 hover:bg-white/[0.03]'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
              <span className="text-2xl font-bold text-white tabular-nums leading-none">{counts[b]}</span>
            </div>
            <div className={`text-[11px] font-medium leading-tight ${selected ? 'text-white' : 'text-gray-400'}`}>
              {t(meta.labelKey)}
            </div>
          </button>
        )
      })}
    </div>
  )
}
