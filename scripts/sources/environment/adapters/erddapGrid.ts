// ERDDAP griddap adapter: fetches a real gridded (u,v) vector field from a NOAA ERDDAP
// dataset and normalizes it to the canonical `VectorGrid` the streamline pipeline consumes.
// One transport, parameterized per source (dataset id, variable names, extent, stride, and the
// timesteps to mean over) - so winds (FNMOC) and currents (Aviso) share it. CSV is used (the
// JSON endpoint proved flaky); ERDDAP writes "NaN" for masked cells, which are skipped so land
// / undefined cells stay masked rather than faked to zero.
//
// The field is a mean over the requested real monthly timesteps - a real average field, not a
// single instant - representative of the prevailing pattern without inventing anything.

import { getText } from '../../_shared'
import type { VectorGrid } from '../streamlines'

export interface ErddapGridConfig {
  base: string
  datasetId: string
  uVar: string
  vVar: string
  lat: [number, number]
  lon: [number, number]
  /** integer index stride on the native grid (e.g. 2 on a 1° grid → ~2° sampling). */
  stride: number
  /** ISO timestamps to fetch and average (each an available monthly field). */
  times: string[]
  /** fixed value for a single-level altitude/depth axis, when the variable has one (e.g. 0). */
  z?: number
}

interface Accum {
  us: number
  vs: number
  n: number
}

function urlFor(cfg: ErddapGridConfig, time: string): string {
  const z = cfg.z != null ? `%5B(${cfg.z})%5D` : ''
  const dim = `%5B(${time})%5D${z}%5B(${cfg.lat[0]}):${cfg.stride}:(${cfg.lat[1]})%5D%5B(${cfg.lon[0]}):${cfg.stride}:(${cfg.lon[1]})%5D`
  return `${cfg.base}/griddap/${cfg.datasetId}.csv?${cfg.uVar}${dim},${cfg.vVar}${dim}`
}

export async function fetchErddapVectorGrid(cfg: ErddapGridConfig): Promise<VectorGrid> {
  const cells = new Map<string, Accum>() // "lat,lon" → running mean accumulator
  const latSet = new Set<number>()
  const lonSet = new Set<number>()

  for (const time of cfg.times) {
    const csv = await getText(urlFor(cfg, time))
    const lines = csv.split('\n')
    // Row 0 is column names (row 1 is units); columns vary with the axis set (an optional
    // altitude column shifts positions), so resolve indices by name.
    const cols = lines[0]!.split(',')
    const iLat = cols.indexOf('latitude')
    const iLon = cols.indexOf('longitude')
    const iU = cols.indexOf(cfg.uVar)
    const iV = cols.indexOf(cfg.vVar)
    if (iLat < 0 || iLon < 0 || iU < 0 || iV < 0) throw new Error(`unexpected columns: ${cols.join(',')}`)
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i]!.trim()
      if (!line) continue
      const c = line.split(',')
      const lat = Number(c[iLat])
      const lon = Number(c[iLon])
      const u = Number(c[iU])
      const v = Number(c[iV])
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      latSet.add(lat)
      lonSet.add(lon)
      if (!Number.isFinite(u) || !Number.isFinite(v)) continue // masked cell ("NaN")
      const key = `${lat},${lon}`
      const a = cells.get(key) ?? { us: 0, vs: 0, n: 0 }
      a.us += u
      a.vs += v
      a.n += 1
      cells.set(key, a)
    }
  }

  const lats = [...latSet].sort((a, b) => a - b)
  const lons = [...lonSet].sort((a, b) => a - b)
  const latIdx = new Map(lats.map((v, i) => [v, i]))
  const lonIdx = new Map(lons.map((v, i) => [v, i]))
  const u: number[][] = lats.map(() => new Array(lons.length).fill(NaN))
  const v: number[][] = lats.map(() => new Array(lons.length).fill(NaN))
  for (const [key, a] of cells) {
    if (a.n === 0) continue
    const [latS, lonS] = key.split(',')
    const j = latIdx.get(Number(latS))!
    const i = lonIdx.get(Number(lonS))!
    u[j]![i] = a.us / a.n
    v[j]![i] = a.vs / a.n
  }
  return { lons, lats, u, v }
}
