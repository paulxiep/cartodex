// Dataset loaders: fetch a baked snapshot and shape it for the engine. Split out from the
// catalog so the registry stays pure data; this module is the only one that knows WHERE
// snapshots live (DATA_BASE) and how each raw JSON maps to features + a value table.
//
// Loaders return the value Map plus its extent (for sqrt sizing / bubbles). They do NOT
// precompute a colour domain: colour scales (log/quantile) are built from the full value
// array at render time by the engine's makeColorScale, so the loader just passes values
// through. Lazy by construction: a loader runs only when a binding is resolved.

import { extent } from 'd3-array'
import type { Feature, FeatureCollection, Point } from 'geojson'
import { flowFeature } from '../engine'
import { DATASETS } from './catalog'
import type { Dataset } from './catalog'

// Where the browser reads baked snapshots. Dev serves them from the app itself
// (`public/data/` -> `./data/`); production points VITE_DATA_BASE at the R2/CDN host the
// scheduled producer writes to, so data refreshes without an app redeploy.
const DATA_BASE = import.meta.env.VITE_DATA_BASE ?? `${import.meta.env.BASE_URL}data/`

function urlOf(ds: Dataset): string {
  return ds.source.mode === 'baked' ? `${DATA_BASE}${ds.source.snapshot}` : ds.source.url
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`dataset: ${r.status} fetching ${url}`)
  return (await r.json()) as T
}

// ── Raw JSON shapes produced by the data pipeline ──────────────────────────────
type RegionTable = Record<string, number>
interface RawPoint {
  id: string
  name: string
  lon: number
  lat: number
  value?: number
  /** extra numeric metrics a dataset may select via `valueField` (e.g. per-vessel-type counts). */
  [metric: string]: string | number | undefined
}
interface RawPair {
  from: string
  to: string
  value?: number
}

function extentOf(values: Iterable<number>): [number, number] {
  const d = extent(values) as [number, number] | [undefined, undefined]
  return [d[0] ?? 0, d[1] ?? 1]
}

export interface RegionValues {
  values: Map<string | number, number>
  domain: [number, number]
}

export async function loadRegionValues(ds: Dataset): Promise<RegionValues> {
  const table = await fetchJson<RegionTable>(urlOf(ds))
  const values = new Map<string | number, number>()
  for (const [k, v] of Object.entries(table)) values.set(k, v)
  return { values, domain: extentOf(values.values()) }
}

export interface PointData {
  features: FeatureCollection
  values: Map<string | number, number>
  domain: [number, number]
  byId: Map<string, RawPoint>
}

/** Shape raw points into a PointData, summing `fields` per point for the marker value. */
function shapePoints(raw: RawPoint[], fields: string[]): PointData {
  const values = new Map<string | number, number>()
  const byId = new Map<string, RawPoint>()
  const features: Feature<Point>[] = raw.map((p) => {
    byId.set(p.id, p)
    let sum = 0
    let any = false
    for (const f of fields) {
      const v = p[f]
      if (typeof v === 'number' && Number.isFinite(v)) {
        sum += v
        any = true
      }
    }
    if (any) values.set(p.id, sum)
    return {
      type: 'Feature',
      id: p.id,
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { name: p.name },
    }
  })
  return { features: { type: 'FeatureCollection', features }, values, domain: extentOf(values.values()), byId }
}

export async function loadPointData(ds: Dataset): Promise<PointData> {
  const raw = await fetchJson<RawPoint[]>(urlOf(ds))
  return shapePoints(raw, ds.valueFields ?? ['value'])
}

/**
 * Merge several point datasets that share ONE snapshot (seaports by vessel type) into a single
 * marker layer: markers are placed once, each sized by the sum over the UNION of the selected
 * datasets' fields. So Cargo (its subtypes) selected with a subtype never double-counts, and
 * there are never stacked duplicate markers at a port.
 */
export async function loadPointsMerged(datasets: Dataset[]): Promise<PointData> {
  const raw = await fetchJson<RawPoint[]>(urlOf(datasets[0]!))
  const fields = [...new Set(datasets.flatMap((d) => d.valueFields ?? ['value']))]
  return shapePoints(raw, fields)
}

export interface PairData {
  features: FeatureCollection
  values: Map<string | number, number>
  domain: [number, number]
}

export async function loadPairData(ds: Dataset): Promise<PairData> {
  if (!ds.endpointsFrom) throw new Error(`pair dataset ${ds.id} missing endpointsFrom`)
  const points = await loadPointData(DATASETS[ds.endpointsFrom]!)
  const raw = await fetchJson<RawPair[]>(urlOf(ds))
  const values = new Map<string | number, number>()
  const features: Feature[] = []
  let i = 0
  for (const f of raw) {
    const a = points.byId.get(f.from)
    const b = points.byId.get(f.to)
    if (!a || !b) continue
    const id = `${f.from}-${f.to}-${i++}`
    if (f.value != null) values.set(id, f.value)
    const feat = flowFeature([a.lon, a.lat], [b.lon, b.lat], { name: `${a.name} → ${b.name}` })
    feat.id = id
    features.push(feat)
  }
  return {
    features: { type: 'FeatureCollection', features },
    values,
    domain: extentOf(values.values()),
  }
}

export interface LinesData {
  features: FeatureCollection
  values: Map<string | number, number>
  domain: [number, number]
}

/**
 * Load a baked LineString network (shipping lanes) or a baked streamline field (winds,
 * currents). The snapshot is a FeatureCollection of LineStrings; a per-feature value property
 * drives line width. Which property is read is `ds.valueField` (e.g. a lane's `cargo` traffic),
 * defaulting to `magnitude` (winds/currents). A dataset with no matching value renders uniform
 * (the unweighted lane network). Feature ids are assigned by index so the scale can key off them.
 */
/** Sum a set of leaf fields per feature into a value map (0 and non-numeric skipped). */
function sumFields(fc: FeatureCollection, fields: Iterable<string>): Map<string | number, number> {
  const list = [...fields]
  const values = new Map<string | number, number>()
  fc.features.forEach((f, i) => {
    f.id = i
    let sum = 0
    let any = false
    for (const field of list) {
      const v = f.properties?.[field]
      if (typeof v === 'number' && v > 0) {
        sum += v
        any = true
      }
    }
    if (any) values.set(i, sum)
  })
  return values
}

export async function loadLinesData(ds: Dataset): Promise<LinesData> {
  const fc = await fetchJson<FeatureCollection>(urlOf(ds))
  const values = sumFields(fc, ds.valueFields ?? ['magnitude'])
  return { features: fc, values, domain: extentOf(values.values()) }
}

/**
 * Merge several line datasets that share ONE snapshot (shipping lanes by ship type) into a single
 * layer: the geometry is drawn once, and each feature's value is the sum over the UNION of the
 * selected datasets' leaf fields. So an aggregate (Cargo) selected alongside its members never
 * double-counts, and the network is drawn once, not stacked. A dataset with no fields (the plain
 * network) contributes nothing, so selecting it alone yields a uniform (unweighted) network.
 */
export async function loadLinesMerged(datasets: Dataset[]): Promise<LinesData> {
  const fc = await fetchJson<FeatureCollection>(urlOf(datasets[0]!))
  const fields = new Set(datasets.flatMap((d) => d.valueFields ?? []))
  const values = sumFields(fc, fields)
  return { features: fc, values, domain: extentOf(values.values()) }
}
