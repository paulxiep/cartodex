// App layer registry. Each layer is a primitive + (optionally) a dataset; build()
// resolves geometry + values into the engine's ResolvedLayer. Adding a topic layer is
// usually just a new entry here pointing at a new dataset - no engine change.

import { loadCountries } from '../engine'
import type { Primitive, ResolvedLayer } from '../engine'
import {
  DATASETS,
  loadRegionValues,
  loadPointData,
  loadFlowData,
} from './datasets'
import { WDI_INDICATORS } from './indicators'

export interface LayerDef {
  id: string
  label: string
  primitive: Primitive
  datasetId?: string
  build(): Promise<ResolvedLayer>
}

// Flight-route density knob: keep only routes flown by at least this many airlines
// (the baked `value`). 1 shows all ~18.8k pairs; raise it to thin the network. This is
// the single place to tune it (a UI control can bind here later).
export const FLIGHT_MIN_COUNT = 2

// Region-choropleth layer factory: any region dataset becomes a layer by id + ramp. The
// layer id is `region-<datasetId>`, so presets referencing e.g. `region-population` are
// stable. Reuses loadCountries + loadRegionValues; no per-indicator code.
function regionLayer(datasetId: string, ramp: string): LayerDef {
  const meta = DATASETS[datasetId]!
  return {
    id: `region-${datasetId}`,
    label: `${meta.label} (choropleth)`,
    primitive: 'region',
    datasetId,
    async build() {
      const [features, region] = await Promise.all([
        loadCountries(),
        loadRegionValues(meta),
      ])
      return {
        id: `region-${datasetId}`,
        primitive: 'region',
        features,
        values: region.values,
        valueDomain: region.domain,
        style: { ramp, stroke: 'rgba(0,0,0,0.25)', strokeWidth: 0.4 },
      }
    },
  }
}

// One region layer per World Bank indicator, generated from the shared catalog.
const WDI_LAYERS: Record<string, LayerDef> = Object.fromEntries(
  WDI_INDICATORS.map((ind) => {
    const layer = regionLayer(ind.id, ind.ramp)
    return [layer.id, layer]
  }),
)

export const LAYERS: Record<string, LayerDef> = {
  'base-land': {
    id: 'base-land',
    label: 'Land & borders',
    primitive: 'base',
    async build() {
      const features = await loadCountries()
      return {
        id: 'base-land',
        primitive: 'base',
        features,
        style: { fill: '#161b23', stroke: '#2b323d', strokeWidth: 0.5 },
      }
    },
  },

  ...WDI_LAYERS,

  'point-airports': {
    id: 'point-airports',
    label: 'Airports',
    primitive: 'point',
    datasetId: 'airports',
    async build() {
      const d = await loadPointData(DATASETS['airports']!)
      return {
        id: 'point-airports',
        primitive: 'point',
        features: d.features,
        values: d.values,
        valueDomain: d.domain,
        style: { fill: '#ffcc44', radiusRange: [1.5, 7] },
      }
    },
  },

  'flow-flights': {
    id: 'flow-flights',
    label: 'Flight routes',
    primitive: 'flow',
    datasetId: 'flights',
    async build() {
      const d = await loadFlowData(DATASETS['flights']!)
      return {
        id: 'flow-flights',
        primitive: 'flow',
        features: d.features,
        values: d.values,
        valueDomain: d.domain,
        style: {
          arcColor: 'rgba(255,180,120,0.55)',
          strokeWidth: 0.5,
          opacity: 0.5,
          minValue: FLIGHT_MIN_COUNT,
        },
      }
    },
  },

  // point-ports and flow-shipping are not wired (see datasets.ts).
}

export const LAYER_LIST: LayerDef[] = Object.values(LAYERS)

/**
 * Resolve a set of layer ids into engine ResolvedLayers (in the given order). A layer
 * whose dataset is unreachable (snapshot not yet built, source down) is dropped with a
 * warning rather than failing the whole compose, so the rest of the map still renders.
 * The returned ids are a subset of the input; the caller can diff to flag what is missing.
 */
export async function buildLayers(ids: string[]): Promise<ResolvedLayer[]> {
  const defs = ids.map((id) => LAYERS[id]).filter((d): d is LayerDef => d != null)
  const settled = await Promise.allSettled(defs.map((d) => d.build()))
  const out: ResolvedLayer[] = []
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') out.push(r.value)
    else {
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason)
      console.warn(`layer ${defs[i]!.id} unavailable: ${reason}`)
    }
  })
  return out
}

/** Attribution strings for the datasets backing the active layers. */
export function attributionsFor(ids: string[]): string[] {
  const out = new Set<string>()
  for (const id of ids) {
    const def = LAYERS[id]
    if (def?.datasetId) {
      const ds = DATASETS[def.datasetId]
      if (ds) out.add(ds.attribution)
    }
  }
  return [...out]
}
