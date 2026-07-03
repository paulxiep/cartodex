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
}
interface RawPair {
  from: string
  to: string
  value?: number
  /** precomputed path geometry (sea lanes) — reserved for M3; ignored here. */
  path?: [number, number][]
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

export async function loadPointData(ds: Dataset): Promise<PointData> {
  const raw = await fetchJson<RawPoint[]>(urlOf(ds))
  const values = new Map<string | number, number>()
  const byId = new Map<string, RawPoint>()
  const features: Feature<Point>[] = raw.map((p) => {
    byId.set(p.id, p)
    if (p.value != null) values.set(p.id, p.value)
    return {
      type: 'Feature',
      id: p.id,
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { name: p.name },
    }
  })
  return {
    features: { type: 'FeatureCollection', features },
    values,
    domain: extentOf(values.values()),
    byId,
  }
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
    // M2 renders great-circle arcs; f.path (sea lanes) is consumed in M3.
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
