// App-side dataset registry + loaders. This is the part the engine deliberately does
// NOT contain: concrete topic data, its licensing/attribution, and how it joins to
// geometry. Each dataset declares a DataSource mode; `baked` reads our re-hosted CDN
// snapshot, `client` would fetch from the licensor at runtime (never re-hosted). The
// baked snapshots are produced by scripts/build-data.ts.

import { extent } from 'd3-array'
import type { Feature, FeatureCollection, Point } from 'geojson'
import { flowFeature } from '../engine'

export type DatasetKind = 'region' | 'point' | 'flow'

export type DataSource =
  | { mode: 'baked'; url: string }
  | { mode: 'client'; url: string; join: { sourceKey: string; geomKey: string } }

export interface DatasetMeta {
  id: string
  label: string
  kind: DatasetKind
  source: DataSource
  attribution: string
  /** for `flow` datasets: the `point` dataset whose ids the endpoints reference. */
  endpointsFrom?: string
}

const DATA_BASE = `${import.meta.env.BASE_URL}data/`

export const DATASETS: Record<string, DatasetMeta> = {
  population: {
    id: 'population',
    label: 'Population',
    kind: 'region',
    source: { mode: 'baked', url: `${DATA_BASE}population.json` },
    attribution: 'Population: World Bank (SP.POP.TOTL) · ISO-3166 crosswalk',
  },
  airports: {
    id: 'airports',
    label: 'Airports',
    kind: 'point',
    source: { mode: 'baked', url: `${DATA_BASE}airports.json` },
    attribution: 'Airports: OpenFlights (Open Database License)',
  },
  flights: {
    id: 'flights',
    label: 'Flight routes',
    kind: 'flow',
    source: { mode: 'baked', url: `${DATA_BASE}flights.json` },
    attribution: 'Flight routes: OpenFlights (ODbL) - top routes by frequency',
    endpointsFrom: 'airports',
  },
  // Not wired: cargo-specific routes, sea ports, shipping routes, relations.
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
interface RawFlow {
  from: string
  to: string
  value?: number
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`dataset: ${r.status} fetching ${url}`)
  return (await r.json()) as T
}

export interface RegionValues {
  values: Map<string | number, number>
  domain: [number, number]
}

export async function loadRegionValues(meta: DatasetMeta): Promise<RegionValues> {
  const table = await fetchJson<RegionTable>(meta.source.url)
  const values = new Map<string | number, number>()
  for (const [k, v] of Object.entries(table)) values.set(k, v)
  const dom = extent(values.values()) as [number, number] | [undefined, undefined]
  return { values, domain: [dom[0] ?? 0, dom[1] ?? 1] }
}

export interface PointData {
  features: FeatureCollection
  values: Map<string | number, number>
  domain: [number, number]
  byId: Map<string, RawPoint>
}

export async function loadPointData(meta: DatasetMeta): Promise<PointData> {
  const raw = await fetchJson<RawPoint[]>(meta.source.url)
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
  const dom = extent(values.values()) as [number, number] | [undefined, undefined]
  return {
    features: { type: 'FeatureCollection', features },
    values,
    domain: [dom[0] ?? 0, dom[1] ?? 1],
    byId,
  }
}

export interface FlowData {
  features: FeatureCollection
  values: Map<string | number, number>
  domain: [number, number]
}

export async function loadFlowData(meta: DatasetMeta): Promise<FlowData> {
  if (!meta.endpointsFrom) throw new Error(`flow dataset ${meta.id} missing endpointsFrom`)
  const points = await loadPointData(DATASETS[meta.endpointsFrom]!)
  const raw = await fetchJson<RawFlow[]>(meta.source.url)
  const values = new Map<string | number, number>()
  const features: Feature[] = []
  let i = 0
  for (const f of raw) {
    const a = points.byId.get(f.from)
    const b = points.byId.get(f.to)
    if (!a || !b) continue
    const id = `${f.from}-${f.to}-${i++}`
    if (f.value != null) values.set(id, f.value)
    const feat = flowFeature([a.lon, a.lat], [b.lon, b.lat], {
      name: `${a.name} → ${b.name}`,
    })
    feat.id = id
    features.push(feat)
  }
  const dom = extent(values.values()) as [number, number] | [undefined, undefined]
  return {
    features: { type: 'FeatureCollection', features },
    values,
    domain: [dom[0] ?? 0, dom[1] ?? 1],
  }
}
