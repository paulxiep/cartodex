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
    id: 'cargo-traffic',
    label: 'Cargo shipping traffic',
    description: 'Shipping lanes weighted by real cargo AIS traffic (commercial and oil & gas, World Bank / IMF).',
    view: 'equirectangular',
    bindings: [
      { channel: 'base', dataset: 'land' },
      { channel: 'lane', dataset: 'shipping-cargo' },
    ],
  },
  {
    id: 'winds-currents',
    label: 'Winds & currents',
    description: 'Surface winds and ocean surface currents as streamlines, the forces that shape the sea lanes.',
    view: 'equirectangular',
    bindings: [
      { channel: 'base', dataset: 'land' },
      { channel: 'field', dataset: 'winds' },
      { channel: 'field', dataset: 'currents' },
    ],
  },
  {
    id: 'maritime-globe',
    label: 'Maritime world',
    description: 'Seaports, ship-traffic routes and surface winds composed on a spin-and-zoom globe.',
    view: 'orthographic',
    bindings: [
      { channel: 'base', dataset: 'land' },
      { channel: 'lane', dataset: 'shipping-all' },
      { channel: 'field', dataset: 'winds' },
      { channel: 'marker', dataset: 'ports' },
    ],
  },
  {
    id: 'ring-of-fire',
    label: 'Ring of Fire',
    description: 'Recent significant earthquakes and volcanoes tracing the tectonic plate boundaries.',
    view: 'equirectangular',
    bindings: [
      { channel: 'base', dataset: 'land' },
      { channel: 'lane', dataset: 'plate-boundaries' },
      { channel: 'marker', dataset: 'quakes-recent' },
      { channel: 'marker', dataset: 'volcanoes' },
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
    id: 'great-earthquakes',
    label: 'Great earthquakes',
    description: 'The great quakes of the instrumental record (M 7+ since 1900) on a spin-and-zoom globe.',
    view: 'orthographic',
    bindings: [
      { channel: 'base', dataset: 'land' },
      { channel: 'marker', dataset: 'quakes-historic' },
    ],
  },
  {
    id: 'world-cities',
    label: 'World cities',
    description: 'The largest cities worldwide, sized by population (Natural Earth).',
    view: 'equirectangular',
    bindings: [
      { channel: 'base', dataset: 'land' },
      { channel: 'marker', dataset: 'cities' },
    ],
  },
  {
    id: 'cities-rivers',
    label: 'Cities & rivers',
    description: 'The largest cities over the world river network — major rivers drawn wider (Natural Earth).',
    view: 'equirectangular',
    bindings: [
      { channel: 'base', dataset: 'land' },
      { channel: 'lane', dataset: 'rivers' },
      { channel: 'marker', dataset: 'cities' },
    ],
  },
  {
    id: 'cables-lanes',
    label: 'Cables & shipping lanes',
    description: 'The two undersea networks together: submarine cables (OSM) over the real shipping lanes.',
    view: 'equirectangular',
    bindings: [
      { channel: 'base', dataset: 'land' },
      { channel: 'lane', dataset: 'shipping' },
      { channel: 'lane', dataset: 'cables' },
    ],
  },
  {
    id: 'connected-world',
    label: 'Connected world',
    description: 'Internet users as a share of population on a spin-and-zoom globe (World Bank).',
    view: 'orthographic',
    bindings: [
      { channel: 'base', dataset: 'land' },
      { channel: 'choropleth', dataset: 'internet-users' },
    ],
  },
  // M5 WP-0 scratch preset: binds the synthetic surface fixture to eyeball the encoding across
  // views (relief background, borders-only base on top). WP-1 replaces it with real elevation.
  {
    id: 'surface-fixture',
    label: 'Relief fixture (synthetic)',
    description: 'WP-0 proof of the surface encoding: synthetic hypsometric bands with a borders-only base.',
    view: 'equirectangular',
    bindings: [
      { channel: 'surface', dataset: 'surface-fixture' },
      { channel: 'base', dataset: 'land' },
    ],
  },
]

export function presetHash(p: Preset): string {
  return toHash({ view: p.view, bindings: p.bindings })
}
