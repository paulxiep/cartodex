// Value→visual scale helpers shared by the value-driven primitives (region/point/flow).

import { scaleSequential, scaleSqrt } from 'd3-scale'
import type { ScaleSequential, ScalePower } from 'd3-scale'
import * as chromatic from 'd3-scale-chromatic'
import type { ResolvedLayer } from '../types'
import type { Feature } from 'geojson'

/** Resolve a d3-scale-chromatic interpolator by short name (e.g. "YlGnBu", "Turbo"). */
export function interpolatorByName(name: string): (t: number) => string {
  const key = `interpolate${name}` as keyof typeof chromatic
  const fn = chromatic[key]
  return typeof fn === 'function' ? (fn as (t: number) => string) : chromatic.interpolateYlGnBu
}

export function choropleth(
  domain: [number, number],
  ramp = 'YlGnBu',
): ScaleSequential<string> {
  return scaleSequential(domain, interpolatorByName(ramp))
}

export function radiusScale(
  domain: [number, number],
  range: [number, number],
): ScalePower<number, number> {
  return scaleSqrt<number, number>().domain(domain).range(range)
}

/** Look up a feature's value from the layer's value table, keyed by feature id. */
export function valueOf(layer: ResolvedLayer, feature: Feature): number | undefined {
  if (!layer.values || feature.id == null) return undefined
  return layer.values.get(feature.id)
}
