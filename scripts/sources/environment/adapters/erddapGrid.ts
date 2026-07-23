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

  let ok = 0
  for (const time of cfg.times) {
    let csv: string
    try {
      csv = await getText(urlFor(cfg, time))
    } catch (e) {
      if (cfg.times.length > 1) {
        console.warn(`    vector grid: skipped ${cfg.datasetId} @ ${time}: ${(e as Error).message}`)
        continue
      }
      throw e
    }
    const lines = csv.split('\n')
    // Row 0 is column names (row 1 is units); columns vary with the axis set (an optional
    // altitude column shifts positions), so resolve indices by name.
    const cols = lines[0]!.split(',')
    const iLat = cols.indexOf('latitude')
    const iLon = cols.indexOf('longitude')
    const iU = cols.indexOf(cfg.uVar)
    const iV = cols.indexOf(cfg.vVar)
    if (iLat < 0 || iLon < 0 || iU < 0 || iV < 0) throw new Error(`unexpected columns: ${cols.join(',')}`)
    ok++
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
  if (ok === 0) throw new Error(`vector grid ${cfg.datasetId}: no field returned data`)

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

// ── Scalar grid (single variable, e.g. ETOPO elevation, SST) ──────────────────────────────

export interface ErddapScalarConfig {
  base: string
  datasetId: string
  variable: string
  lat: [number, number]
  lon: [number, number]
  /** integer index stride on the native grid (e.g. 30 on ETOPO's 1/60° grid → ~0.5° sampling). */
  stride: number
  /** ISO timestamps to fetch and average (each an available field). Omit for a static grid with no
   *  time axis (ETOPO); a single time for one field; several to mean into a climatology. */
  times?: string[]
  /** fixed value for a single-level altitude/depth axis, when the variable has one (e.g. 0). */
  z?: number
}

export interface ScalarGrid {
  lons: number[] // ascending
  lats: number[] // ascending
  /** values[latIdx][lonIdx]; NaN for masked cells (kept masked, never faked to zero). */
  values: number[][]
}

interface ScalarAccum {
  sum: number
  n: number
}

function scalarUrl(cfg: ErddapScalarConfig, time?: string): string {
  const t = time != null ? `%5B(${time})%5D` : ''
  const z = cfg.z != null ? `%5B(${cfg.z})%5D` : ''
  const dim = `${t}${z}%5B(${cfg.lat[0]}):${cfg.stride}:(${cfg.lat[1]})%5D%5B(${cfg.lon[0]}):${cfg.stride}:(${cfg.lon[1]})%5D`
  return `${cfg.base}/griddap/${cfg.datasetId}.csv?${cfg.variable}${dim}`
}

/**
 * Fetch a downsampled scalar grid (one variable) from an ERDDAP griddap dataset as CSV. Same
 * transport as the vector fetch (CSV, index stride). With no `times` it reads a static grid (ETOPO
 * relief); with one or more it fetches each and returns the per-cell MEAN of the real fields (a
 * monthly SST climatology is the mean over the requested months) - masked cells stay masked, never
 * faked to zero. A single time that fails to fetch is skipped so one missing month does not sink a
 * multi-month mean; the whole fetch throws only if no field returned usable data.
 */
export async function fetchErddapScalarGrid(cfg: ErddapScalarConfig): Promise<ScalarGrid> {
  const times: (string | undefined)[] = cfg.times ?? [undefined] // one static fetch when no time axis
  const cells = new Map<string, ScalarAccum>() // "lat,lon" → running mean accumulator
  const latSet = new Set<number>()
  const lonSet = new Set<number>()
  let ok = 0

  for (const time of times) {
    let csv: string
    try {
      csv = await getText(scalarUrl(cfg, time))
    } catch (e) {
      if (cfg.times && cfg.times.length > 1) {
        console.warn(`    scalar grid: skipped ${cfg.datasetId} @ ${time}: ${(e as Error).message}`)
        continue
      }
      throw e
    }
    const lines = csv.split('\n')
    const cols = lines[0]!.split(',')
    const iLat = cols.indexOf('latitude')
    const iLon = cols.indexOf('longitude')
    const iVal = cols.indexOf(cfg.variable)
    if (iLat < 0 || iLon < 0 || iVal < 0) throw new Error(`unexpected columns: ${cols.join(',')}`)
    ok++
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i]!.trim()
      if (!line) continue
      const c = line.split(',')
      const lat = Number(c[iLat])
      const lon = Number(c[iLon])
      const val = Number(c[iVal])
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      latSet.add(lat)
      lonSet.add(lon)
      if (!Number.isFinite(val)) continue // masked cell ("NaN")
      const key = `${lat},${lon}`
      const a = cells.get(key) ?? { sum: 0, n: 0 }
      a.sum += val
      a.n += 1
      cells.set(key, a)
    }
  }
  if (ok === 0) throw new Error(`scalar grid ${cfg.datasetId}: no field returned data`)

  const lats = [...latSet].sort((a, b) => a - b)
  const lons = [...lonSet].sort((a, b) => a - b)
  const latIdx = new Map(lats.map((v, i) => [v, i]))
  const lonIdx = new Map(lons.map((v, i) => [v, i]))
  const values: number[][] = lats.map(() => new Array<number>(lons.length).fill(NaN))
  for (const [key, a] of cells) {
    if (a.n === 0) continue
    const [latS, lonS] = key.split(',')
    values[latIdx.get(Number(latS))!]![lonIdx.get(Number(lonS))!] = a.sum / a.n
  }
  return { lons, lats, values }
}

/**
 * Remap a scalar grid whose longitudes run 0..360 (e.g. OISST) to the -180..180 convention,
 * re-sorted ascending, so the contour-band factory sees the full sphere with the seam at the
 * antimeridian. A no-op when the grid is already -180..180. Columns are permuted, rows (latitude)
 * untouched.
 */
export function scalarGridTo180(grid: ScalarGrid): ScalarGrid {
  if (grid.lons.every((l) => l <= 180)) return grid
  const order = grid.lons
    .map((l, i) => [l > 180 ? l - 360 : l, i] as const)
    .sort((a, b) => a[0] - b[0])
  const lons = order.map(([l]) => l)
  const values = grid.values.map((row) => order.map(([, i]) => row[i]!))
  return { lons, lats: grid.lats, values }
}
