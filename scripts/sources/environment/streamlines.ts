// Central, source-agnostic streamline pipeline for gridded vector fields (winds, ocean
// currents). It consumes the canonical `VectorGrid` that every environment adapter normalizes
// to - it never sees NetCDF, ERDDAP JSON, or any wire format - and emits GeoJSON LineStrings
// traced along the flow, each carrying a `magnitude` (mean speed) that the `field` primitive
// maps to streamline width.
//
// Placement uses an evenly-spaced streamline scheme (Jobard & Lefer): an occupancy grid keeps
// lines a minimum separation apart, so the field reads as clean, non-overlapping flow and the
// line count stays bounded (the SVG node budget, not physical density, is the ceiling). Line
// geometry follows the direction field only; speed drives width, not the path, so the field is
// a schematic of direction + strength rather than a physical trajectory.

import type { Feature, LineString } from 'geojson'

/** Canonical gridded vector field. `u`/`v` are indexed [latIndex][lonIndex]; both axes sorted
 *  ascending (lons in [-180,180), lats in [-90,90]). Adapters own this normalization. */
export interface VectorGrid {
  lons: number[]
  lats: number[]
  u: number[][] // eastward component
  v: number[][] // northward component
}

export interface StreamlineOptions {
  /** minimum separation between streamlines, in degrees (occupancy-grid cell size). */
  sepDeg?: number
  /** integration step, in degrees. */
  stepDeg?: number
  /** max integration steps per direction (forward + backward each). */
  maxSteps?: number
  /** drop cells whose speed is below this (no-flow / masked land). */
  minSpeed?: number
  /** hard cap on emitted streamlines (budget guard). */
  maxLines?: number
}

const DEFAULTS: Required<StreamlineOptions> = {
  sepDeg: 4,
  stepDeg: 1.1,
  maxSteps: 14,
  minSpeed: 0.5,
  maxLines: 600,
}

type Vec = { u: number; v: number; speed: number }

/** Bilinear sample of the field at (lon, lat); null outside the grid or on a masked cell. */
function sample(grid: VectorGrid, lon: number, lat: number): Vec | null {
  const { lons, lats, u, v } = grid
  if (lat < lats[0]! || lat > lats[lats.length - 1]!) return null
  // Longitude wraps; find the bracketing lon indices (grid is global in lon).
  const lonMin = lons[0]!
  const lonMax = lons[lons.length - 1]!
  let clon = lon
  if (clon < lonMin) clon += 360
  if (clon > lonMax + (lons[1]! - lons[0]!)) return null
  const li = lowerBound(lons, clon)
  const lj = lowerBound(lats, lat)
  const i0 = Math.max(0, Math.min(li, lons.length - 2))
  const j0 = Math.max(0, Math.min(lj, lats.length - 2))
  const x0 = lons[i0]!, x1 = lons[i0 + 1]!
  const y0 = lats[j0]!, y1 = lats[j0 + 1]!
  const tx = x1 === x0 ? 0 : (clon - x0) / (x1 - x0)
  const ty = y1 === y0 ? 0 : (lat - y0) / (y1 - y0)
  const uu = bilinear(u, i0, j0, tx, ty)
  const vv = bilinear(v, i0, j0, tx, ty)
  if (uu == null || vv == null) return null
  return { u: uu, v: vv, speed: Math.hypot(uu, vv) }
}

function bilinear(m: number[][], i0: number, j0: number, tx: number, ty: number): number | null {
  const a = m[j0]?.[i0], b = m[j0]?.[i0 + 1], c = m[j0 + 1]?.[i0], d = m[j0 + 1]?.[i0 + 1]
  if (a == null || b == null || c == null || d == null) return null
  if (![a, b, c, d].every(Number.isFinite)) return null
  const top = a * (1 - tx) + b * tx
  const bot = c * (1 - tx) + d * tx
  return top * (1 - ty) + bot * ty
}

/** Largest index with arr[i] <= x (arr ascending). */
function lowerBound(arr: number[], x: number): number {
  let lo = 0, hi = arr.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (arr[mid]! <= x) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Step one increment along (±) the direction field, correcting lon for latitude convergence. */
function advance(lon: number, lat: number, vec: Vec, stepDeg: number, sign: number): [number, number] {
  const inv = 1 / Math.max(vec.speed, 1e-6)
  const cos = Math.max(0.2, Math.cos((lat * Math.PI) / 180))
  const dlat = sign * stepDeg * vec.v * inv
  const dlon = (sign * stepDeg * vec.u * inv) / cos
  return [lon + dlon, lat + dlat]
}

export function integrateStreamlines(grid: VectorGrid, options: StreamlineOptions = {}): Feature<LineString>[] {
  const opt = { ...DEFAULTS, ...options }
  const occ = new OccupancyGrid(opt.sepDeg)
  const lines: Feature<LineString>[] = []

  // Seed candidates: a coarse regular grid, ordered strong-flow first so the prominent jets
  // (trade winds, the Gulf Stream) are laid down before weaker fill.
  const seeds: { lon: number; lat: number; speed: number }[] = []
  for (let lat = -80; lat <= 80; lat += opt.sepDeg) {
    for (let lon = -180; lon < 180; lon += opt.sepDeg) {
      const s = sample(grid, lon, lat)
      if (s && s.speed >= opt.minSpeed) seeds.push({ lon, lat, speed: s.speed })
    }
  }
  seeds.sort((a, b) => b.speed - a.speed)

  for (const seed of seeds) {
    if (lines.length >= opt.maxLines) break
    if (occ.occupied(seed.lon, seed.lat)) continue
    const line = trace(grid, seed.lon, seed.lat, opt, occ)
    if (line) lines.push(line)
  }
  return lines
}

/** Trace one streamline forward and backward from a seed, respecting the occupancy grid. */
function trace(
  grid: VectorGrid,
  lon0: number,
  lat0: number,
  opt: Required<StreamlineOptions>,
  occ: OccupancyGrid,
): Feature<LineString> | null {
  const fwd = walk(grid, lon0, lat0, opt, occ, +1)
  const bwd = walk(grid, lon0, lat0, opt, occ, -1)
  const coords = [...bwd.reverse(), [lon0, lat0] as [number, number], ...fwd]
  if (coords.length < 3) return null
  const speeds = coords.map((c) => sample(grid, c[0], c[1])?.speed ?? 0)
  const magnitude = speeds.reduce((a, b) => a + b, 0) / speeds.length
  for (const [lon, lat] of coords) occ.mark(lon, lat)
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords.map(([lon, lat]) => [round(lon), round(lat)]) },
    properties: { magnitude: Number(magnitude.toFixed(3)) },
  }
}

function walk(
  grid: VectorGrid,
  lon0: number,
  lat0: number,
  opt: Required<StreamlineOptions>,
  occ: OccupancyGrid,
  sign: number,
): [number, number][] {
  const out: [number, number][] = []
  let lon = lon0, lat = lat0
  for (let step = 0; step < opt.maxSteps; step++) {
    const v1 = sample(grid, lon, lat)
    if (!v1 || v1.speed < opt.minSpeed) break
    // RK2 (midpoint) for a smoother curve than plain Euler.
    const [ml, mt] = advance(lon, lat, v1, opt.stepDeg / 2, sign)
    const v2 = sample(grid, ml, mt) ?? v1
    const [nl, nt] = advance(lon, lat, v2, opt.stepDeg, sign)
    if (nt < -88 || nt > 88) break
    const wl = wrapLon(nl)
    if (step > 0 && occ.occupiedByOther(wl, nt)) break
    out.push([wl, nt])
    lon = wl
    lat = nt
  }
  return out
}

const round = (n: number): number => Number(n.toFixed(2))
function wrapLon(lon: number): number {
  let l = lon
  while (l < -180) l += 360
  while (l >= 180) l -= 360
  return l
}

/** Occupancy grid for even streamline spacing: marks visited cells; a new line stops when it
 *  approaches a cell already claimed by a different line. */
class OccupancyGrid {
  private readonly cells = new Set<number>()
  private readonly cols: number
  constructor(private readonly sepDeg: number) {
    this.cols = Math.ceil(360 / sepDeg)
  }
  private key(lon: number, lat: number): number {
    const ci = Math.floor((lon + 180) / this.sepDeg)
    const cj = Math.floor((lat + 90) / this.sepDeg)
    return cj * this.cols + ci
  }
  occupied(lon: number, lat: number): boolean {
    return this.cells.has(this.key(lon, lat))
  }
  occupiedByOther(lon: number, lat: number): boolean {
    // Same test; a line does not check its own not-yet-marked cells (marked only on commit).
    return this.cells.has(this.key(lon, lat))
  }
  mark(lon: number, lat: number): void {
    this.cells.add(this.key(lon, lat))
  }
}
