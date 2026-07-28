// Named (view × bindings) combinations - the cells the gallery showcases. Each preset is
// just data; it deep-links into the composer via the URL hash (toHash). Curated to a spread of
// nine that spans the four views, the major channels, and distinct domains.

import type { ViewId } from '../engine'
import type { Binding } from './layers'
import { toHash, defaultMonth } from './state'

export interface Preset {
  id: string
  label: string
  description: string
  view: ViewId
  bindings: Binding[]
  /** month (1-12) to open at, for a preset that binds a temporal layer (winds/currents/SST). */
  month?: number
}

export const PRESETS: Preset[] = [
  {
    id: 'gdp-and-population',
    label: 'GDP + population (bivariate)',
    description: 'Choropleth GDP per capita with population as proportional bubbles: two datasets at once.',
    view: 'equirectangular',
    bindings: [
      { channel: 'base', dataset: 'land' },
      { channel: 'choropleth', dataset: 'gdp-per-capita' },
      { channel: 'bubble', dataset: 'population' },
    ],
  },
  {
    id: 'population-growth',
    label: 'Population growth',
    description: 'Yearly population growth on a diverging scale: countries gaining vs shrinking read as opposite colours around zero (World Bank).',
    view: 'orthographic',
    bindings: [
      { channel: 'base', dataset: 'land' },
      { channel: 'choropleth', dataset: 'pop-growth' },
    ],
  },
  {
    id: 'colored-cartogram',
    label: 'Colored cartogram',
    description: 'Countries scaled by population and colored by GDP per capita: area and colour composed.',
    view: 'equal-earth',
    bindings: [
      { channel: 'area', dataset: 'population' },
      { channel: 'choropleth', dataset: 'gdp-per-capita' },
    ],
  },
  {
    id: 'relief-bathymetry',
    label: 'Relief & bathymetry',
    description: 'Global hypsometric relief from ETOPO: land elevation and ocean bathymetry on one diverging sea/land scale (NOAA, public domain).',
    view: 'equirectangular',
    bindings: [
      { channel: 'surface', dataset: 'elevation' },
      { channel: 'base', dataset: 'land' },
    ],
  },
  {
    id: 'sst-currents',
    label: 'SST & currents',
    description: 'Sea-surface temperature (NOAA OISST monthly climatology) as an ocean-heat surface, with geostrophic surface currents streaming over it: pick a month to see the season shift.',
    view: 'equirectangular',
    month: 7,
    bindings: [
      { channel: 'surface', dataset: 'sst' },
      { channel: 'field', dataset: 'currents' },
      { channel: 'base', dataset: 'land' },
    ],
  },
  {
    id: 'seaports-lanes',
    label: 'Seaports & shipping lanes',
    description: 'Seaports sized by real AIS vessel traffic (IMF PortWatch) over the real shipping-lane network.',
    view: 'equirectangular',
    bindings: [
      { channel: 'base', dataset: 'land' },
      { channel: 'lane', dataset: 'shipping' },
      { channel: 'marker', dataset: 'ports' },
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
  {
    id: 'ring-of-fire-globe',
    label: 'Ring of Fire (globe)',
    description: 'The seismic belt, volcanoes and plate boundaries on a spin-and-zoom globe.',
    view: 'orthographic',
    bindings: [
      { channel: 'base', dataset: 'land' },
      { channel: 'lane', dataset: 'plate-boundaries' },
      { channel: 'marker', dataset: 'quakes-recent' },
      { channel: 'marker', dataset: 'volcanoes' },
    ],
  },
  {
    id: 'cities-rivers',
    label: 'Cities & rivers',
    description: 'The largest cities over the world river network: major rivers drawn wider (Natural Earth).',
    view: 'equirectangular',
    bindings: [
      { channel: 'base', dataset: 'land' },
      { channel: 'lane', dataset: 'rivers' },
      { channel: 'marker', dataset: 'cities' },
    ],
  },
]

export function presetHash(p: Preset): string {
  return toHash({ view: p.view, bindings: p.bindings, month: p.month ?? defaultMonth() })
}
