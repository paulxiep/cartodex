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
    id: 'gdp-per-capita',
    label: 'GDP per capita',
    description: 'Equirectangular choropleth of GDP per capita (World Bank).',
    view: 'equirectangular',
    layers: ['base-land', 'region-gdp-per-capita'],
  },
  {
    id: 'life-expectancy-globe',
    label: 'Life expectancy globe',
    description: 'Life expectancy choropleth on a spin/zoom orthographic globe.',
    view: 'orthographic',
    layers: ['base-land', 'region-life-expectancy'],
  },
  {
    id: 'population-cartogram',
    label: 'Population cartogram',
    description: 'Each country scaled in place around its centroid by population (non-contiguous).',
    view: 'cartogram-noncontiguous',
    layers: ['region-population'],
  },
  {
    id: 'co2-per-capita',
    label: 'CO2 per capita',
    description: 'Equirectangular choropleth of CO2 emissions per capita.',
    view: 'equirectangular',
    layers: ['base-land', 'region-co2-per-capita'],
  },
  {
    id: 'renewable-energy',
    label: 'Renewable energy',
    description: 'Share of final energy from renewables, equirectangular choropleth.',
    view: 'equirectangular',
    layers: ['base-land', 'region-renewable-energy-pct'],
  },
  {
    id: 'polar-flights',
    label: 'Polar flight routes',
    description: 'Azimuthal-equidistant polar map with airports and great-circle flight arcs (OpenFlights).',
    view: 'azimuthal-equidistant',
    layers: ['base-land', 'point-airports', 'flow-flights'],
  },
]

export function presetHash(p: Preset): string {
  return `#view=${p.view}&layers=${p.layers.join(',')}`
}
