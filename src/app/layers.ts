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

  'region-population': {
    id: 'region-population',
    label: 'Population (choropleth)',
    primitive: 'region',
    datasetId: 'population',
    async build() {
      const [features, region] = await Promise.all([
        loadCountries(),
        loadRegionValues(DATASETS['population']!),
      ])
      return {
        id: 'region-population',
        primitive: 'region',
        features,
        values: region.values,
        valueDomain: region.domain,
        style: { ramp: 'YlGnBu', stroke: 'rgba(0,0,0,0.25)', strokeWidth: 0.4 },
      }
    },
  },

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

/** Resolve a set of layer ids into engine ResolvedLayers (in the given order). */
export async function buildLayers(ids: string[]): Promise<ResolvedLayer[]> {
  const defs = ids.map((id) => LAYERS[id]).filter((d): d is LayerDef => d != null)
  return Promise.all(defs.map((d) => d.build()))
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
