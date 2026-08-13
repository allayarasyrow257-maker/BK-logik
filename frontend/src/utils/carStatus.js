// Maps a raw car status string to one of 4 buckets used by the customer
// dashboard filter and status badges. Colour + i18n label per bucket.
export function carBucket(status) {
  const s = (status || '').toLowerCase()
  if (s.includes('arriv')) return 'arrived'
  if (
    s.includes('loaded in container') ||
    s.includes('reserved container') ||
    (s.includes('container') && !s.includes('not')) ||
    (s.includes('loaded') && !s.includes('not'))
  ) return 'loaded'
  return 'notLoaded' // 'Not loaded', 'Not in warehouse', unknown …
}

export const BUCKETS = ['all', 'loaded', 'notLoaded', 'arrived']

export const BUCKET_META = {
  all:       { labelKey: 'common.statusAll',       dot: 'bg-gold-400',  badge: 'bg-gold-500/10 text-gold-400',   ring: 'border-gold-400/70' },
  loaded:    { labelKey: 'common.statusLoaded',    dot: 'bg-blue-400',  badge: 'bg-blue-500/10 text-blue-400',   ring: 'border-blue-400/70' },
  notLoaded: { labelKey: 'common.statusNotLoaded', dot: 'bg-amber-400', badge: 'bg-amber-500/10 text-amber-400', ring: 'border-amber-400/70' },
  arrived:   { labelKey: 'common.statusArrived',   dot: 'bg-green-400', badge: 'bg-green-500/10 text-green-400', ring: 'border-green-400/70' },
}

export function statusMeta(status) {
  return BUCKET_META[carBucket(status)]
}
