// Named (view × bindings) combinations - the cells the gallery showcases. Each preset is
// just data; it deep-links into the composer via the URL hash (toHash). The bivariate and
// colored-cartogram presets showcase the M2 headline: two datasets bound at once.

import type { ViewId } from '../engine'
import type { Binding } from './layers'
import { toHash } from './state'

export interface Preset {
  id: string
  label: string
  description: string
  view: ViewId
  bindings: Binding[]
}

export const PRESETS: Preset[] = [
  {
    id: 'gdp-per-capita',
    label: 'GDP per capita',
    description: 'Equirectangular choropleth of GDP per capita (log scale, World Bank).',
    view: 'equirectangular',
    bindings: [
      { channel: 'base', dataset: 'land' },
      { channel: 'choropleth', dataset: 'gdp-per-capita' },
    ],
  },
  {
    id: 'gdp-and-population',
    label: 'GDP + population (bivariate)',
    description: 'Choropleth GDP per capita with population as proportional bubbles — two datasets at once.',
    view: 'equirectangular',
    bindings: [
      { channel: 'base', dataset: 'land' },
      { channel: 'choropleth', dataset: 'gdp-per-capita' },
      { channel: 'bubble', dataset: 'population' },
    ],
  },
  {
    id: 'life-expectancy-globe',
    label: 'Life expectancy globe',
    description: 'Life expectancy choropleth on a spin/zoom orthographic globe.',
    view: 'orthographic',
    bindings: [
      { channel: 'base', dataset: 'land' },
      { channel: 'choropleth', dataset: 'life-expectancy' },
    ],
  },
  {
    id: 'population-cartogram',
    label: 'Population cartogram',
    description: 'Each country scaled in place by population on an Equal Earth base (non-contiguous).',
    view: 'equal-earth',
    bindings: [{ channel: 'area', dataset: 'population' }],
  },
  {
    id: 'colored-cartogram',
    label: 'Colored cartogram',
    description: 'Countries scaled by population and colored by GDP per capita — area + colour composed.',
    view: 'equal-earth',
    bindings: [
      { channel: 'area', dataset: 'population' },
      { channel: 'choropleth', dataset: 'gdp-per-capita' },
    ],
  },
  {
    id: 'polar-flights',
    label: 'Polar flight routes',
    description: 'Azimuthal-equidistant polar map with airports and great-circle flight arcs (OpenFlights).',
    view: 'azimuthal-equidistant',
    bindings: [
      { channel: 'base', dataset: 'land' },
      { channel: 'marker', dataset: 'airports' },
      { channel: 'arc', dataset: 'flights' },
    ],
  },
]

export function presetHash(p: Preset): string {
  return toHash({ view: p.view, bindings: p.bindings })
}
