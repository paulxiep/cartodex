// Composer state <-> URL hash. State is the active view plus a set of channel bindings; the
// hash encodes it as `#view=<id>&<channel>=<dataset>[:<scale>][,<dataset2>…]` so any map is
// shareable/deep-linkable. Single-occupancy channels take one dataset (extra items ignored);
// multi-occupancy take a comma list; `base` is structural (`base=land`). Parsing validates
// view, channel, dataset existence, and dataset-kind↔channel match, dropping anything stale.

import { VIEW_LIST, CHANNEL_LIST } from '../engine'
import type { ChannelId, ScaleType, ViewId } from '../engine'
import { DATASETS } from './catalog'
import type { Binding } from './layers'

export interface State {
  view: ViewId
  bindings: Binding[]
  /** active month (1-12) for temporal datasets (winds/currents/SST); ignored by the rest. */
  month: number
}

/** Default month when neither the hash nor a preset pins one: the current calendar month, so a
 *  temporal map opens seasonally relevant. */
export const defaultMonth = (): number => new Date().getMonth() + 1

export function toHash(state: State): string {
  const parts = [`view=${state.view}`]
  const byChannel = new Map<ChannelId, Binding[]>()
  for (const b of state.bindings) {
    const list = byChannel.get(b.channel) ?? (byChannel.set(b.channel, []), byChannel.get(b.channel)!)
    list.push(b)
  }
  for (const [channel, list] of byChannel) {
    const value =
      channel === 'base'
        ? 'land'
        : list.map((b) => (b.scale ? `${b.dataset}:${b.scale}` : b.dataset)).join(',')
    parts.push(`${channel}=${value}`)
  }
  // Encode the month only when a temporal layer is bound, so non-temporal maps keep clean, stable hashes.
  if (state.bindings.some((b) => DATASETS[b.dataset]?.temporal)) parts.push(`month=${state.month}`)
  return `#${parts.join('&')}`
}

export function parseHash(hash: string, fallback: State): State {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const viewRaw = params.get('view')
  const view = VIEW_LIST.some((v) => v.id === viewRaw) ? (viewRaw as ViewId) : fallback.view

  const monthRaw = Number(params.get('month'))
  const month = Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : fallback.month

  const bindings: Binding[] = []
  for (const channel of CHANNEL_LIST) {
    const raw = params.get(channel.id)
    if (raw == null) continue
    if (channel.id === 'base') {
      bindings.push({ channel: 'base', dataset: 'land' })
      continue
    }
    const items = raw.split(',').filter(Boolean)
    const chosen = channel.capacity === 'single' ? items.slice(0, 1) : items
    for (const item of chosen) {
      const [dataset, scale] = item.split(':')
      const ds = dataset ? DATASETS[dataset] : undefined
      if (!ds || ds.kind !== channel.datasetKind) continue
      bindings.push({ channel: channel.id, dataset: ds.id, ...(scale ? { scale: scale as ScaleType } : {}) })
    }
  }
  return bindings.length ? { view, bindings, month } : fallback
}
