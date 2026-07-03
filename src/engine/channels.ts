// Display-mode channel registry. A channel is how a dataset's values map to a visual
// variable: choropleth (region→colour), area (region→size, an in-place cartogram scaling),
// bubble (region-centroid→size), marker (point→size), arc (pair→width), field (grid→
// streamline width). `base` is the structural land/borders channel (no dataset). Each channel
// names the primitive it draws through, its capacity (how many datasets it holds), the dataset
// kind it binds, and a default scale type.
//
// Capacity is intrinsic to the encoding (you cannot legibly stack two choropleths), so it
// lives here, not in the composer; the composer reads it to build single- vs multi-select
// slots. Views that a channel is valid on are decided by compatible(view, channel).

import type { Channel, ChannelId } from './types'

export const CHANNELS: Record<ChannelId, Channel> = {
  base: {
    id: 'base',
    label: 'Land & borders',
    primitive: 'base',
    capacity: 'structural',
    encodes: 'none',
    defaultScaleType: 'linear',
  },
  choropleth: {
    id: 'choropleth',
    label: 'Choropleth (colour)',
    primitive: 'region',
    capacity: 'single',
    encodes: 'color',
    datasetKind: 'region',
    defaultScaleType: 'linear',
  },
  area: {
    id: 'area',
    label: 'Area (cartogram)',
    primitive: 'region',
    capacity: 'single',
    encodes: 'size',
    datasetKind: 'region',
    defaultScaleType: 'sqrt',
    requiresEqualArea: true,
  },
  bubble: {
    id: 'bubble',
    label: 'Bubble (size)',
    primitive: 'region-symbol',
    capacity: 'single',
    encodes: 'size',
    datasetKind: 'region',
    defaultScaleType: 'sqrt',
  },
  marker: {
    id: 'marker',
    label: 'Markers',
    primitive: 'point',
    capacity: 'multi',
    encodes: 'size',
    datasetKind: 'point',
    defaultScaleType: 'sqrt',
  },
  arc: {
    id: 'arc',
    label: 'Arcs (flows)',
    primitive: 'flow',
    capacity: 'multi',
    encodes: 'width',
    datasetKind: 'pair',
    defaultScaleType: 'linear',
  },
  field: {
    id: 'field',
    label: 'Field (streamlines)',
    primitive: 'field',
    capacity: 'multi',
    encodes: 'width',
    datasetKind: 'grid',
    defaultScaleType: 'sqrt',
  },
  lane: {
    id: 'lane',
    label: 'Lanes (network)',
    primitive: 'field',
    capacity: 'multi',
    encodes: 'width',
    datasetKind: 'lines',
    defaultScaleType: 'sqrt',
  },
}

export const CHANNEL_LIST: Channel[] = Object.values(CHANNELS)

export function getChannel(id: ChannelId): Channel {
  return CHANNELS[id]
}
