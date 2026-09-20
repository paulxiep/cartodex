// Composer state and its URL-hash encoding. State is the active view plus a set of channel bindings;
// `toHash` encodes it as `#view=<id>&<channel>=<dataset>[:<scale>][,<dataset2>…]` so any map is
// shareable/deep-linkable. This module is deliberately engine/d3-free (it imports only the dataset
// catalog), so the gallery - which reaches it via presets → presetHash → toHash - stays engine-free.
// The inverse, parseHash (validated against the engine's view/channel registries), lives in the
// composer, its only caller, to keep those engine imports out of this pure module.
import type { ChannelId, ViewId } from '../engine'
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

