// Natural Earth reference geography (public domain). `buildCities`: the world's largest populated
// places as points on the `marker` channel, sized by max population. The 50m "simple"
// populated-places set is a clean top-N cities layer (mirrors the airports point layer). Real
// coordinates and populations as Natural Earth reports them; capped to the top by population so
// the snapshot stays in budget and legible (too many dots read as noise).

import type { Feature, FeatureCollection, LineString, MultiLineString, Point, Position } from 'geojson'
import { getJson, simplify } from '../_shared'

const CITIES_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_populated_places_simple.geojson'

// 10m rivers + lake centerlines WITH scale rank and tributaries: the full network (a real Amazon
// basin, not the sparse basic set), digitized to meet the 50m coastline the base map uses.
const RIVERS_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines_scale_rank.geojson'

// River decimation steps (Manhattan degrees). Rivers are the heaviest line layer, so WP-2 bakes two
// tiers: a light COARSE default (world-fit, where rivers are tiny) and a FINE tier fetched on zoom.
const RIVER_STEP_COARSE = 0.25 // -> rivers.json (default; sub-pixel at world-fit, under the weight budget)
const RIVER_STEP_FINE = 0.05 // -> rivers-fine.json (deep zoom; the prior single-tier detail)

// Keep the largest N by population - a legible, budget-safe world-cities layer.
const TOP_N = 1500

interface CityProps { name?: string; nameascii?: string; adm0name?: string; pop_max?: number }

export interface RawPoint { id: string; name: string; lon: number; lat: number; value?: number }

const q3 = (n: number): number => Number(n.toFixed(3))

export async function buildCities(): Promise<RawPoint[]> {
  const fc = await getJson<FeatureCollection<Point, CityProps>>(CITIES_URL)
  const rows: Omit<RawPoint, 'id'>[] = []
  for (const f of fc.features) {
    const p = f.properties ?? {}
    const name = (p.name || p.nameascii || '').trim()
    const c = f.geometry?.coordinates
    if (!name || !c || typeof c[0] !== 'number' || typeof c[1] !== 'number') continue
    const pop = typeof p.pop_max === 'number' && Number.isFinite(p.pop_max) && p.pop_max > 0 ? p.pop_max : undefined
    rows.push({
      name: p.adm0name ? `${name}, ${p.adm0name}` : name,
      lon: q3(c[0]),
      lat: q3(c[1]),
      ...(pop != null ? { value: pop } : {}),
    })
  }
  // Top-N by population (unknown population sorts last); assign stable index ids (city names are
  // not globally unique, so index ids avoid two cities colliding on one marker value key).
  const top = rows
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, TOP_N)
    .map((r, i) => ({ id: `city-${i}`, ...r }))
  console.log(`  cities: ${top.length} of ${rows.length} (Natural Earth 50m populated places, public domain)`)
  return top
}

// `buildRivers`: the world's rivers and lake centerlines as a `lines` network on the `lane`
// channel. The 10m rivers + lake-centerlines (scale rank) set is one file covering both, with the
// full tributary network (a real Amazon basin). Natural Earth's `scalerank` orders rivers by
// prominence (lower = more major); we invert it to a positive `rank` weight so the lane channel
// draws major rivers (Amazon, Nile, Mississippi) wider than minor tributaries. Build-time simplified
// at a finer step than the ocean-scale lines. Real geometry only; a river with no rank renders at width 1.
interface RiverProps { scalerank?: number }

export async function buildRivers(): Promise<{ coarse: FeatureCollection; fine: FeatureCollection }> {
  const raw = await getJson<FeatureCollection<LineString | MultiLineString, RiverProps>>(RIVERS_URL)
  // Compute the max scalerank present so the inversion is self-contained (no magic constant): a
  // river at the top rank keeps a weight of 1, the most major river gets `maxRank + 1`.
  let maxRank = 0
  for (const f of raw.features) {
    const r = f.properties?.scalerank
    if (typeof r === 'number' && Number.isFinite(r) && r > maxRank) maxRank = r
  }
  // Decimate the shared source at a given step into a lane network (one fetch, two tiers).
  const build = (step: number): FeatureCollection => {
    const features: Feature<LineString>[] = []
    for (const f of raw.features) {
      const g = f.geometry
      const parts: Position[][] =
        g.type === 'MultiLineString'
          ? (g as MultiLineString).coordinates
          : g.type === 'LineString'
            ? [(g as LineString).coordinates]
            : []
      const sr = f.properties?.scalerank
      const rank = typeof sr === 'number' && Number.isFinite(sr) ? maxRank - sr + 1 : 1
      for (const part of parts) {
        const coords = simplify(part, step)
        if (coords.length >= 2) {
          features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { rank } })
        }
      }
    }
    return { type: 'FeatureCollection', features }
  }
  const coarse = build(RIVER_STEP_COARSE)
  const fine = build(RIVER_STEP_FINE)
  const verts = (fc: FeatureCollection): number =>
    fc.features.reduce((s, f) => s + (f.geometry as LineString).coordinates.length, 0)
  console.log(
    `  rivers: coarse ${coarse.features.length} seg / ${verts(coarse)} v, fine ${fine.features.length} seg / ${verts(fine)} v (Natural Earth 10m rivers + lake centerlines, public domain)`,
  )
  return { coarse, fine }
}
