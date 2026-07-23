// Submarine communications cables as a `lines` network on the `lane` channel (maritime) - "the
// other network under the sea", drawn alongside the shipping lanes. Source: OpenStreetMap via the
// Overpass API (ODbL). TeleGeography's submarine cable map was rejected: it is CC BY-NC-SA 3.0
// (non-commercial + share-alike), which the commercial-open data rule excludes. OSM coverage is
// thinner but permissively licensed and re-hostable as a baked snapshot; the build guard keeps a
// too-thin fetch from shipping a broken layer. Overpass is only the build-time source (like GitHub
// raw is for the other Natural Earth lines) - the output is a plain baked FeatureCollection.
//
// OSM tagging is mid-transition: the modern tag is `communication=line` + `location=underwater`,
// but much existing data still uses the deprecated `man_made=submarine_cable` (and `submarine=yes`).
// We union all three so coverage is not lost to the tag migration. Build-time simplified to the
// per-snapshot weight budget (same simplifier as shipping lanes and plate boundaries).

import type { Feature, FeatureCollection, LineString, Position } from 'geojson'
import { getJson, simplify } from '../_shared'

const OVERPASS = 'https://overpass-api.de/api/interpreter'

// `out geom` returns each way's node coordinates inline, so no second lookup is needed.
const QUERY = `[out:json][timeout:90];
(
  way["communication"="line"]["location"="underwater"];
  way["man_made"="submarine_cable"];
  way["submarine"="yes"]["communication"];
);
out geom;`

interface OverpassWay { type: string; geometry?: Array<{ lat: number; lon: number }> }
interface OverpassResult { elements: OverpassWay[] }

export async function buildCables(): Promise<FeatureCollection> {
  const raw = await getJson<OverpassResult>(`${OVERPASS}?data=${encodeURIComponent(QUERY)}`)
  const features: Feature<LineString>[] = []
  for (const el of raw.elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue
    const line: Position[] = el.geometry
      .filter((n) => typeof n.lon === 'number' && typeof n.lat === 'number')
      .map((n) => [n.lon, n.lat])
    const coords = simplify(line)
    if (coords.length >= 2) {
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} })
    }
  }
  const verts = features.reduce((s, f) => s + f.geometry.coordinates.length, 0)
  console.log(`  cables: ${features.length} segments, ${verts} vertices (OpenStreetMap via Overpass, ODbL)`)
  return { type: 'FeatureCollection', features }
}
