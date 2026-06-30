// Named (view × layers) combinations - the cells the gallery showcases. Each preset
// is just data; it deep-links into the composer via the URL hash.

import type { ViewId } from '../engine'

export interface Preset {
  id: string
  label: string
  description: string
  view: ViewId
  layers: string[]
}

export const PRESETS: Preset[] = [
  {
    id: 'polar-flights',
    label: 'Polar flight routes',
    description: 'Azimuthal-equidistant polar map with airports and great-circle flight arcs (OpenFlights).',
    view: 'azimuthal-equidistant',
    layers: ['base-land', 'point-airports', 'flow-flights'],
  },
  {
    id: 'population-noncontiguous',
    label: 'Population - non-contiguous cartogram',
    description: 'Each country scaled in place around its centroid by population.',
    view: 'cartogram-noncontiguous',
    layers: ['region-population'],
  },
  {
    id: 'population-choropleth',
    label: 'Population - choropleth',
    description: 'Equirectangular population choropleth over land and borders.',
    view: 'equirectangular',
    layers: ['base-land', 'region-population'],
  },
  {
    id: 'ortho-routes',
    label: 'Orthographic globe routes',
    description: 'A 2.5D SVG globe with airports and flight arcs (back hemisphere clipped).',
    view: 'orthographic',
    layers: ['base-land', 'point-airports', 'flow-flights'],
  },
]

export function presetHash(p: Preset): string {
  return `#view=${p.view}&layers=${p.layers.join(',')}`
}
