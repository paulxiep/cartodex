// Value→visual scale helpers shared by the value-driven primitives (region/point/flow).
//
// Color scales are built from a ScaleSpec + the full value array (quantile needs every
// value, not just the extent). `linear` is a sequential ramp over [min,max]; `log` fixes
// magnitude skew (GDP, population) and masks non-positive values as no-data; `quantile`
// equalizes colour across the distribution; `threshold` buckets at breakpoints. Size
// scales stay `scaleSqrt` (radius).

import { extent, quantile } from 'd3-array'
import { scaleSequential, scaleSequentialLog, scaleSqrt, scaleQuantile, scaleThreshold } from 'd3-scale'
import type { ScalePower } from 'd3-scale'
import * as chromatic from 'd3-scale-chromatic'
import type { ResolvedLayer, ScaleSpec } from '../types'
import type { Feature } from 'geojson'

/** A resolved colour function: value → CSS colour, or `undefined` for no-data / out-of-domain. */
export type ColorFn = (v: number) => string | undefined

/** Resolve a d3-scale-chromatic interpolator by short name (e.g. "YlGnBu", "Turbo"). */
export function interpolatorByName(name = 'YlGnBu'): (t: number) => string {
  const key = `interpolate${name}` as keyof typeof chromatic
  const fn = chromatic[key]
  return typeof fn === 'function' ? (fn as (t: number) => string) : chromatic.interpolateYlGnBu
}

/** Sample a continuous interpolator into `n` discrete swatches (for quantile/threshold). */
function swatches(interp: (t: number) => string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => interp(n === 1 ? 0.5 : i / (n - 1)))
}

const BUCKETS = 7

/**
 * Build a colour function from a value set and a scale spec. The full value iterable is
 * consumed once (quantile/threshold need the whole distribution). Non-finite values, and
 * non-positive values under `log`, resolve to `undefined` (rendered as no-data).
 */
export function makeColorScale(values: Iterable<number>, spec: ScaleSpec): ColorFn {
  const interp = interpolatorByName(spec.ramp)
  const arr = [...values].filter((v) => Number.isFinite(v))
  if (arr.length === 0) return () => undefined

  switch (spec.type) {
    case 'log': {
      const positive = arr.filter((v) => v > 0)
      if (positive.length === 0) return () => undefined
      const [min, max] = extent(positive) as [number, number]
      const s = scaleSequentialLog([min, max], interp)
      return (v) => (v > 0 && Number.isFinite(v) ? s(v) : undefined)
    }
    case 'quantile': {
      const s = scaleQuantile<string>().domain(arr).range(swatches(interp, BUCKETS))
      return (v) => (Number.isFinite(v) ? s(v) : undefined)
    }
    case 'threshold': {
      const sorted = [...arr].sort((a, b) => a - b)
      const breaks =
        spec.thresholds ??
        Array.from({ length: BUCKETS - 1 }, (_, i) => quantile(sorted, (i + 1) / BUCKETS) ?? 0)
      const s = scaleThreshold<number, string>().domain(breaks).range(swatches(interp, breaks.length + 1))
      return (v) => (Number.isFinite(v) ? s(v) : undefined)
    }
    case 'sqrt': // sqrt is a size scale; as a colour fallback behave linear.
    case 'linear':
    default: {
      const [min, max] = extent(arr) as [number, number]
      const s = scaleSequential([min, max], interp)
      return (v) => (Number.isFinite(v) ? s(v) : undefined)
    }
  }
}

/** Size scale: sqrt so encoded area (not radius) is proportional to value. */
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
