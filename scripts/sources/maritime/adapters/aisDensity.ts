// AIS ship-density adapter: samples the World Bank / IMF Global Ship Density rasters (real AIS
// position counts, 2015-2021) along shipping-lane geometry, to weight each lane by real traffic
// per vessel class. The services are ArcGIS TilesOnly image services, but their tiles are LERC
// (they carry the real Int32 pixel values, not colourised pixels), so we fetch the tiles the
// lanes cross, decode with Esri's `lerc`, and read the values - no giant raster download.
//
// Each lane is densified (its coarse vertices are ~28 km apart, finer than the raster cell) and
// the class density is averaged over the densified points: the lane's real mean traffic for that
// class. A masked / no-data / 1-floored cell reads as 0 (never faked to a positive value).

import { createRequire } from 'node:module'
import type { Feature, FeatureCollection, LineString } from 'geojson'

const require = createRequire(import.meta.url)
const Lerc = require('lerc') as {
  load: () => Promise<void>
  decode: (buf: ArrayBuffer) => { width: number; height: number; pixels: Int32Array[]; maskData?: Uint8Array }
}

// The five real Global Ship Density vessel classes (the source has no finer cargo split).
export const DENSITY_CLASSES = ['Commercial', 'Oil_and_Gas', 'Passenger', 'Leisure', 'Fishing'] as const
export type DensityClass = (typeof DENSITY_CLASSES)[number]

const svcUrl = (cls: DensityClass): string =>
  `https://tiledimageservices.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/Global_Ship_Density_${cls}/ImageServer`

// Tiling scheme (from the service metadata): origin top-left, 256px tiles. Level 5 ≈ 0.04°/px
// (~4.5 km), fine enough for lanes and canals while keeping the tile count bounded.
const OX = -180.015311275
const OY = 85.00264793700009
const Z = 5
const RES = 0.04
const TILE = 256

interface DecodedTile {
  pixels: Int32Array
  mask?: Uint8Array
}

const tileKey = (tx: number, ty: number): string => `${tx}/${ty}`

/** Densify a lane so consecutive sample points are ~one raster cell apart (catches straits). */
function densify(coords: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < coords.length - 1; i++) {
    const [x0, y0] = coords[i]!
    const [x1, y1] = coords[i + 1]!
    const steps = Math.max(1, Math.ceil((Math.abs(x1 - x0) + Math.abs(y1 - y0)) / RES))
    for (let s = 0; s < steps; s++) out.push([x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps])
  }
  out.push(coords[coords.length - 1]!)
  return out
}

const tileOf = (lon: number, lat: number): [number, number] => [
  Math.floor((lon - OX) / RES / TILE),
  Math.floor((OY - lat) / RES / TILE),
]

/** Fetch + decode the given tiles for one class, with bounded concurrency. Missing tile → null. */
async function loadTiles(cls: DensityClass, keys: Set<string>): Promise<Map<string, DecodedTile | null>> {
  const base = svcUrl(cls)
  const out = new Map<string, DecodedTile | null>()
  const list = [...keys]
  const CONC = 12
  let i = 0
  async function worker(): Promise<void> {
    while (i < list.length) {
      const key = list[i++]!
      const [tx, ty] = key.split('/').map(Number) as [number, number]
      let dec: DecodedTile | null = null
      try {
        const r = await fetch(`${base}/tile/${Z}/${ty}/${tx}`)
        if (r.ok) {
          const d = Lerc.decode(await r.arrayBuffer())
          dec = { pixels: d.pixels[0]!, mask: d.maskData }
        }
      } catch {
        dec = null
      }
      out.set(key, dec)
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker))
  return out
}

function pixelValue(tiles: Map<string, DecodedTile | null>, lon: number, lat: number): number {
  const [tx, ty] = tileOf(lon, lat)
  const d = tiles.get(tileKey(tx, ty))
  if (!d) return 0
  const px = Math.floor((lon - OX) / RES) % TILE
  const py = Math.floor((OY - lat) / RES) % TILE
  const idx = py * TILE + px
  if (d.mask && d.mask[idx] === 0) return 0
  const v = d.pixels[idx] ?? 0
  return v > 1 ? v : 0
}

/**
 * For each lane feature return its mean density for every class. One pass over the densified
 * points collects the tiles each class needs; tiles are fetched per class and sampled.
 */
export async function sampleLaneDensities(fc: FeatureCollection): Promise<Record<DensityClass, number>[]> {
  await Lerc.load()
  const lines = fc.features.filter((f): f is Feature<LineString> => f.geometry?.type === 'LineString')
  const densified = lines.map((f) => densify(f.geometry.coordinates as [number, number][]))

  const keys = new Set<string>()
  for (const pts of densified) for (const [lon, lat] of pts) keys.add(tileKey(...tileOf(lon, lat)))

  const perFeature: Record<DensityClass, number>[] = lines.map(() => ({} as Record<DensityClass, number>))
  for (const cls of DENSITY_CLASSES) {
    const tiles = await loadTiles(cls, keys)
    densified.forEach((pts, i) => {
      let sum = 0
      for (const [lon, lat] of pts) sum += pixelValue(tiles, lon, lat)
      perFeature[i]![cls] = Math.round(sum / pts.length)
    })
    console.log(`    ${cls}: ${tiles.size} tiles sampled`)
  }
  return perFeature
}
