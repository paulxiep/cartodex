// Tectonic plate boundaries: the lines that trace where the ground moves, as a `lines` dataset
// on the `lane` channel (uniform width, context geometry, like the plain shipping network).
// Source: fraxen/tectonicplates (Peter Bird 2003 boundaries), ODC-BY 1.0 - an attribution-only
// open-data licence: no share-alike, and no obligation on software that uses the data. The
// attribution (Ahlenius / Nordpil / Bird) is recorded in the catalog row. Build-time simplified
// to the per-snapshot weight budget via the shared line simplifier (same as shipping lanes).

import type { Feature, FeatureCollection, LineString, MultiLineString, Position } from 'geojson'
import { getJson, simplify } from '../_shared'

const PLATES_URL =
  'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json'

export async function buildPlates(): Promise<FeatureCollection> {
  const raw = await getJson<FeatureCollection>(PLATES_URL)
  const features: Feature<LineString>[] = []
  for (const f of raw.features) {
    const g = f.geometry
    const parts: Position[][] =
      g.type === 'MultiLineString'
        ? (g as MultiLineString).coordinates
        : g.type === 'LineString'
          ? [(g as LineString).coordinates]
          : []
    for (const part of parts) {
      const coords = simplify(part)
      if (coords.length >= 2) {
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} })
      }
    }
  }
  const verts = features.reduce((s, f) => s + f.geometry.coordinates.length, 0)
  console.log(`  plates: ${features.length} boundary segments, ${verts} vertices (fraxen/tectonicplates, Bird 2003, ODC-BY)`)
  return { type: 'FeatureCollection', features }
}
