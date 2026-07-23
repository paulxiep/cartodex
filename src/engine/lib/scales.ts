// Value→visual scale helpers shared by the value-driven primitives (region/point/flow).
//
// Color scales are built from a ScaleSpec + the full value array (quantile needs every
// value, not just the extent). `linear` is a sequential ramp over [min,max]; `log` fixes
// magnitude skew (GDP, population) and masks non-positive values as no-data; `quantile`
// equalizes colour across the distribution; `threshold` buckets at breakpoints. Size
// scales stay `scaleSqrt` (radius).

import { extent, quantile } from 'd3-array'
import { scaleSequential, scaleSequentialLog, scaleSqrt, scaleQuantile, scaleThreshold, scaleLinear } from 'd3-scale'
import type { ScalePower } from 'd3-scale'
import * as chromatic from 'd3-scale-chromatic'
import type { DivergingRamp, RampRef, ResolvedLayer, ScaleSpec } from '../types'
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

/** Interpolate an explicit list of colour stops (evenly spaced) into a t→colour function. */
function stopsInterpolator(stops: string[]): (t: number) => string {
  if (stops.length <= 1) return () => stops[0] ?? '#000'
  const positions = stops.map((_, i) => i / (stops.length - 1))
  const s = scaleLinear<string, string>().domain(positions).range(stops).clamp(true)
  return (t) => s(t)
}

/** Resolve a ramp reference (a stock scheme name or a custom stop-list) to a t→colour function. */
function rampInterpolator(ref: RampRef): (t: number) => string {
  return Array.isArray(ref) ? stopsInterpolator(ref) : interpolatorByName(ref)
}

/**
 * Swatches for a diverging threshold scale: buckets at or below the pivot draw from the
 * `below` ramp, the rest from `above`, so the ramp seam lands exactly on the pivot however
 * asymmetric the extents are (deep ocean vs high summit). `breaks` are the threshold domain;
 * there is one more bucket than break. Each side's ramp runs pivot-ward → outward across its
 * buckets (below: deep→pivot; above: pivot→high).
 */
function divergingSwatches(d: DivergingRamp, breaks: number[]): string[] {
  const pivot = d.pivot ?? 0
  const belowCount = breaks.filter((b) => b <= pivot).length
  const aboveCount = breaks.length + 1 - belowCount
  return [...swatches(rampInterpolator(d.below), belowCount), ...swatches(rampInterpolator(d.above), aboveCount)]
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
      // A diverging spec colours each side of its pivot from its own ramp (sea vs land relief);
      // otherwise the single ramp is sampled evenly across all buckets.
      const range = spec.diverging
        ? divergingSwatches(spec.diverging, breaks)
        : swatches(interp, breaks.length + 1)
      const s = scaleThreshold<number, string>().domain(breaks).range(range)
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
