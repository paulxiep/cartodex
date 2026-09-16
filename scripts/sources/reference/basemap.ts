// Self-hosted multi-resolution base geometry, derived from ONE Natural Earth 1:10m source
// (public domain, license-clean). Emits world-{10m,50m,110m}.json: a full-detail 10m tier plus
// mid/coarse tiers derived from it by topological simplification, so the tiers are strict subsets
// and a zoom-driven tier swap only sharpens (borders never jump). This replaces the world-atlas
// CDN dependency with same-origin tiers. Static: seeded once (make seed-static), not on the cron.
//
// The output matches the world-atlas topology the engine's geodata loaders read: a `countries`
// object whose geometry ids are ISO 3166-1 numeric as zero-padded 3-digit STRINGS (regions join
// to values by this exact key), plus a merged `land` object. Quantized on one shared grid.

import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type {
  GeometryCollection,
  MultiPolygon as TopoMultiPolygon,
  Objects,
  Polygon as TopoPolygon,
  Topology,
} from 'topojson-specification'
import { topology } from 'topojson-server'
import { presimplify, quantile, simplify } from 'topojson-simplify'
import { mergeArcs, quantize } from 'topojson-client'
import { getJson } from '../_shared'

// One Natural Earth 1:10m source for all three tiers (nvkelso mirror, the same host as the rivers set).
const NE_10M_COUNTRIES =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson'

// Shared coordinate-quantization grid (matches world-atlas 50m). ~0.0036 deg (~400 m) at global
// extent - below one pixel at every supported zoom. One grid for all tiers so their arcs align.
const QUANT = 1e5

// Fraction of interior vertices to KEEP per tier (topojson-simplify quantile sorts weights
// descending, so p is the retained fraction). Fine keeps the most, coarser tiers keep less; because
// each tier thresholds the same weighted topology, the tiers are nested subsets. Tuned by output
// size (~2 MB / ~0.5 MB / ~0.2 MB); the 10m tier is fetched only on deep zoom.
const FINE_KEEP = 0.5 // -> world-10m.json (sharp; deep-zoom only)
const MID_KEEP = 0.12 // -> world-50m.json
const COARSE_KEEP = 0.04 // -> world-110m.json

interface NeProps {
  NAME?: string
  ISO_N3?: string
  ISO_N3_EH?: string
}

// ISO 3166-1 numeric id as world-atlas keys it: a zero-padded 3-digit STRING; regions join to
// values by this exact key with no coercion (scales.ts valueOf). Natural Earth files France/Norway
// sovereignty under ISO_N3_EH ("250"/"578") while ISO_N3 is "-99", so prefer _EH; a feature with
// neither valid (Kosovo) gets no id and renders as no-data - matching world-atlas's null ids.
function isoId(p: NeProps): string | undefined {
  const raw =
    p.ISO_N3_EH && p.ISO_N3_EH !== '-99'
      ? p.ISO_N3_EH
      : p.ISO_N3 && p.ISO_N3 !== '-99'
        ? p.ISO_N3
        : undefined
  return raw ? raw.padStart(3, '0') : undefined
}

export interface BaseTier {
  file: string
  topo: Topology
  countries: number
}

export async function buildBasemap(): Promise<BaseTier[]> {
  const fc = await getJson<FeatureCollection<Polygon | MultiPolygon, NeProps>>(NE_10M_COUNTRIES, 120000)
  // Strip to id + name only: Natural Earth ships ~160 properties per feature, which would bloat the
  // tiers by an order of magnitude. The region tooltip reads properties.name (lowercase).
  const features: Feature[] = fc.features.map((f) => ({
    type: 'Feature',
    id: isoId(f.properties ?? {}),
    properties: { name: f.properties?.NAME ?? '' },
    geometry: f.geometry,
  }))
  const keyed = features.filter((f) => f.id != null).length
  console.log(`  basemap: ${features.length} countries from Natural Earth 10m (${keyed} ISO-keyed, public domain)`)

  // One non-quantized, presimplified topology; SPHERICAL weights so simplification is area-correct
  // on the globe. Each coarser tier is a further in-place simplification of it (a strict subset).
  const collection: FeatureCollection = { type: 'FeatureCollection', features }
  // presimplify + simplify need ABSOLUTE coordinates (they de-delta a quantized topology and would
  // corrupt it), so weight and simplify the raw topology, then quantize each tier at the end. @types
  // skew: topojson-server types topology() nullable; topojson-simplify/client want Objects<{}>.
  const pre = presimplify(topology({ countries: collection }) as unknown as Topology<Objects>)

  // Thresholds from the full weighted topology; each tier is an independent simplify(pre, w) so the
  // tiers are nested subsets (borders align across a zoom swap). presimplify pins arc endpoints to
  // Infinity, so every arc keeps at least its two ends and quantize never sees an empty arc.
  const wFine = quantile(pre, FINE_KEEP)
  const wMid = quantile(pre, MID_KEEP)
  const wCoarse = quantile(pre, COARSE_KEEP)
  return [
    finish('world-10m.json', quantize(simplify(pre, wFine), QUANT)),
    finish('world-50m.json', quantize(simplify(pre, wMid), QUANT)),
    finish('world-110m.json', quantize(simplify(pre, wCoarse), QUANT)),
  ]
}

// Quantize a copy of the (progressively simplified) topology and attach a merged `land` object, so
// the file matches the world-atlas structure the engine's loaders read (countries + land).
// Attach a merged `land` object so the file matches the world-atlas structure the engine's loaders
// read (countries + land). The topology is already quantized.
function finish(file: string, topo: Topology<Objects>): BaseTier {
  const countries = topo.objects['countries'] as GeometryCollection
  // mergeArcs iterates its objects arg (an array of polygonal geometries), so pass the geometries,
  // not the collection wrapper; the merged land outline keeps the engine's loadLand API whole.
  const polys = countries.geometries as Array<TopoPolygon | TopoMultiPolygon>
  const land: GeometryCollection = { type: 'GeometryCollection', geometries: [mergeArcs(topo, polys)] }
  topo.objects['land'] = land
  return { file, topo, countries: countries.geometries.length }
}
