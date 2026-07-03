// Which (view, channel) cells are meaningful. The composer uses this to disable channel
// slots that have no meaning under the active view, instead of rendering nonsense.
//
// Today only the `area` channel is gated: an in-place cartogram scaling assumes true areas,
// so it needs an equal-area base (Equal Earth). Every other channel - choropleth, bubble,
// markers, arcs, base - is valid on all views. New gates are added here as data.

import type { ChannelId, View } from './types'
import { getChannel } from './channels'

export function compatible(view: View, channel: ChannelId): boolean {
  const ch = getChannel(channel)
  if (ch.requiresEqualArea && !view.equalArea) return false
  return true
}
