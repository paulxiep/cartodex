// Shipping-lanes source adapter: the real global shipping-lane network (newzealandpaul/
// Shipping-Lanes, CC BY-SA 4.0), derived from observed AIS traffic. Emits a plain
// FeatureCollection of LineStrings - the geometry only - which the `lane` channel draws as a
// subtle background layer (the real corridors ships follow, shaped by the winds and currents
// shown alongside). No weighting is invented here: the source's coarse Major/Middle/Minor
// class is dropped rather than dressed up as a volume.
//
// The raw file is ~1.17 MB; coordinates are quantized to 2 dp (~1 km, fine for ocean lanes)
// and near-duplicate vertices dropped, to fit the per-snapshot weight budget.

import type { Feature, FeatureCollection, LineString, MultiLineString, Position } from 'geojson'
import { getJson } from '../_shared'
import { sampleLaneDensities } from './adapters/aisDensity'

const LANES_URL =
  'https://raw.githubusercontent.com/newzealandpaul/Shipping-Lanes/main/data/Shipping_Lanes_v1.geojson'

// Drop a vertex closer than this (degrees) to the last kept one - decimates the dense source
// without visibly changing an ocean-scale lane.
const MIN_STEP_DEG = 0.25

const q2 = (n: number): number => Number(n.toFixed(2))

/** Quantize + decimate one line; always keeps the first and last vertex. */
function simplify(coords: Position[]): Position[] {
  const out: Position[] = []
  let last: Position | null = null
  for (let i = 0; i < coords.length; i++) {
    const p: Position = [q2(coords[i]![0]!), q2(coords[i]![1]!)]
    const isEnd = i === 0 || i === coords.length - 1
    if (isEnd || !last || Math.abs(p[0]! - last[0]!) + Math.abs(p[1]! - last[1]!) >= MIN_STEP_DEG) {
      out.push(p)
      last = p
    }
  }
  return out
}

export async function buildLanes(): Promise<FeatureCollection> {
  const raw = await getJson<FeatureCollection>(LANES_URL)
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
  console.log(`  lanes: ${features.length} segments, ${verts} vertices (Shipping-Lanes, CC BY-SA)`)

  // Weight each lane by real AIS traffic per vessel class (World Bank / IMF Global Ship Density).
  const fc: FeatureCollection = { type: 'FeatureCollection', features }
  try {
    const densities = await sampleLaneDensities(fc)
    features.forEach((f, i) => {
      const d = densities[i]!
      const commercial = d.Commercial ?? 0
      const oilgas = d.Oil_and_Gas ?? 0
      const passenger = d.Passenger ?? 0
      const leisure = d.Leisure ?? 0
      const fishing = d.Fishing ?? 0
      f.properties = {
        commercial, oilgas, passenger, leisure, fishing,
        cargo: commercial + oilgas, // cargo group
        others: passenger + leisure + fishing, // non-cargo group
        all: commercial + oilgas + passenger + leisure + fishing,
      }
    })
    console.log(`  lanes: AIS traffic weights attached (5 classes, Global Ship Density)`)
  } catch (e) {
    console.warn(`  lanes: traffic weighting skipped (${(e as Error).message}); lanes stay unweighted`)
  }
  return fc
}
