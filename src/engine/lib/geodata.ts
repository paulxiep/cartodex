// Geometry loading helpers. Geometry (country/land shapes) is open-licensed, fetched then decoded
// from TopoJSON to GeoJSON, and cached by URL so multiple layers/views share one fetch. This is
// generic geometry, not a topic dataset, so it belongs in the engine. Each loader takes a URL: the
// app passes self-hosted multi-resolution tiers (WP-2 lazy geometry), while the built-in default
// below keeps the engine usable standalone.

import { feature, mesh } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Feature, FeatureCollection, MultiLineString } from 'geojson'

/** Engine standalone default: world-atlas 50m (Natural Earth derived), keyed by ISO 3166-1 numeric.
 *  The app overrides this with same-origin tier URLs; a package consumer that passes no URL still
 *  gets working geometry from the CDN. */
const WORLD_50M = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json'

const cache = new Map<string, Promise<Topology>>()

function loadTopology(url: string): Promise<Topology> {
  let pending = cache.get(url)
  if (!pending) {
    pending = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`geodata: ${r.status} fetching ${url}`)
      return r.json() as Promise<Topology>
    })
    cache.set(url, pending)
  }
  return pending
}

/** Countries as a FeatureCollection; each feature `id` is the ISO numeric code. */
export async function loadCountries(url = WORLD_50M): Promise<FeatureCollection> {
  const topo = await loadTopology(url)
  const countries = topo.objects['countries'] as GeometryCollection
  const fc = feature(topo, countries) as unknown as FeatureCollection
  return fc
}

/** Country borders as a single MultiLineString feature (shared-edge mesh). */
export async function loadBorders(url = WORLD_50M): Promise<Feature<MultiLineString>> {
  const topo = await loadTopology(url)
  const countries = topo.objects['countries'] as GeometryCollection
  const geometry = mesh(topo, countries, (a, b) => a !== b)
  return { type: 'Feature', geometry, properties: {} }
}

/** Land outline as a single feature, useful as a globe/base fill. */
export async function loadLand(url = WORLD_50M): Promise<FeatureCollection> {
  const topo = await loadTopology(url)
  const land = topo.objects['land'] as GeometryCollection
  return feature(topo, land) as unknown as FeatureCollection
}
