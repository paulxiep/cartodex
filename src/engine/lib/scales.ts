// Value→visual scale helpers shared by the value-driven primitives (region/point/flow).
//
// Color scales are built from a ScaleSpec + the full value array (quantile needs every
// value, not just the extent). `linear` is a sequential ramp over a robust-by-default domain
// (the central 2–98% of values, clamped, so outliers don't flatten the ramp), or two half-ramps
// around a pivot when `diverging` (signed indicators); `log` fixes magnitude skew (GDP, population)
// and masks non-positive values as no-data; `quantile` equalizes colour across the distribution;
// `threshold` buckets at breakpoints. Size scales stay `scaleSqrt` (radius).

import { extent, quantile } from 'd3-array'
import { scaleSequential, scaleSequentialLog, scaleSqrt, scaleQuantile, scaleThreshold, scaleLinear } from 'd3-scale'
import type { ScalePower } from 'd3-scale'
import * as chromatic from 'd3-scale-chromatic'
import type { DivergingRamp, RampRef, ResolvedLayer, ScaleSpec } from '../types'
import type { Feature } from 'geojson'

/** A resolved colour function: value → CSS colour, or `undefined` for no-data / out-of-domain. */
export type ColorFn = (v: number) => string | undefined

/**
 * A resolved colour scale: the `color` function the primitives fill with, plus the metadata a
 * legend needs to decode it. Both the renderer and the legend consume the SAME resolver, so the
 * legend never re-derives the domain - it reads these fields and samples `color` for its swatches,
 * which makes legend colours identical to the map by construction.
 *   - `kind`      - continuous (`sequential`/`diverging`) vs discrete (`quantile`/`threshold`).
 *   - `domain`    - the shown endpoints: the robust/clamped window for sequential, the symmetric
 *                   bound for diverging, or the value extent for quantile.
 *   - `extent`    - the true value min/max, so the legend can flag clamped ends (`≤`/`≥`).
 *   - `pivot`     - the diverging centre (a legend tick); absent for non-diverging.
 *   - `breaks`    - band boundaries for the discrete kinds (threshold breaks, quantile cuts).
 *   - `clampedLow`/`clampedHigh` - whether real values fall below/above the shown `domain`.
 */
export interface ResolvedScale {
  color: ColorFn
  kind: 'sequential' | 'diverging' | 'quantile' | 'threshold'
  domain: [number, number]
  extent: [number, number]
  pivot?: number
  breaks?: number[]
  clampedLow: boolean
  clampedHigh: boolean
}

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

/** Default robust percentile window: clamp the colour domain to the central 2–98% of values. */
const ROBUST_WINDOW: [number, number] = [0.02, 0.98]

/**
 * The colour domain for a sequential (linear/log) scale. When `robust` is on, clamp to a
 * percentile window (default 2–98%) so a few outliers can't flatten the ramp for the bulk of the
 * data; otherwise use the raw min/max extent. `robust === false` forces the raw extent; a tuple
 * overrides the window. Falls back to the extent if quantiles are unavailable (tiny arrays).
 */
function sequentialDomain(arr: number[], robust: ScaleSpec['robust']): [number, number] {
  const [min, max] = extent(arr) as [number, number]
  if (robust === false) return [min, max]
  const [pLow, pHigh] = Array.isArray(robust) ? robust : ROBUST_WINDOW
  const sorted = [...arr].sort((a, b) => a - b)
  const lo = quantile(sorted, pLow)
  const hi = quantile(sorted, pHigh)
  return lo != null && hi != null && lo < hi ? [lo, hi] : [min, max]
}

/** Which ends of `domain` real values overshoot (so a legend can mark them `≤`/`≥`). */
function clampFlags(domain: [number, number], ext: [number, number]): { clampedLow: boolean; clampedHigh: boolean } {
  return { clampedLow: ext[0] < domain[0], clampedHigh: ext[1] > domain[1] }
}

/**
 * A continuous diverging colour scale: two half-ramps meeting at the pivot over a *symmetric*
 * bound, so equal magnitudes either side of the pivot read as equally saturated opposite hues (for
 * signed indicators — net migration, growth — around zero). The bound is the robust extent measured
 * from the pivot; each half is clamped so out-of-window values pin to the extreme colour.
 */
function makeDivergingLinear(arr: number[], spec: ScaleSpec): ResolvedScale {
  const d = spec.diverging!
  const pivot = d.pivot ?? 0
  const [lo, hi] = sequentialDomain(arr, spec.robust)
  const m = Math.max(Math.abs(hi - pivot), Math.abs(lo - pivot)) || 1
  const below = scaleSequential([pivot - m, pivot], rampInterpolator(d.below)).clamp(true)
  const above = scaleSequential([pivot, pivot + m], rampInterpolator(d.above)).clamp(true)
  const domain: [number, number] = [pivot - m, pivot + m]
  const ext = extent(arr) as [number, number]
  return {
    color: (v) => (!Number.isFinite(v) ? undefined : v <= pivot ? below(v) : above(v)),
    kind: 'diverging',
    domain,
    extent: ext,
    pivot,
    ...clampFlags(domain, ext),
  }
}

/**
 * Resolve a colour scale from a value set and a scale spec: the `color` fill function plus the
 * legend metadata (see `ResolvedScale`). The full value iterable is consumed once
 * (quantile/threshold need the whole distribution). Non-finite values, and non-positive values
 * under `log`, resolve to `undefined` (rendered as no-data).
 */
export function resolveColorScale(values: Iterable<number>, spec: ScaleSpec): ResolvedScale {
  // Resolve the ramp once, accepting either a stock scheme name or a custom stop-list; every
  // scale type (linear/log/quantile/threshold) then samples the same t→colour function, so a
  // sequential threshold (e.g. an SST heatmap) can carry a bespoke palette just like a scheme.
  const interp = rampInterpolator(spec.ramp ?? 'YlGnBu')
  const arr = [...values].filter((v) => Number.isFinite(v))
  if (arr.length === 0) {
    return { color: () => undefined, kind: 'sequential', domain: [0, 0], extent: [0, 0], clampedLow: false, clampedHigh: false }
  }
  const ext = extent(arr) as [number, number]

  switch (spec.type) {
    case 'log': {
      const positive = arr.filter((v) => v > 0)
      if (positive.length === 0) {
        return { color: () => undefined, kind: 'sequential', domain: [0, 0], extent: ext, clampedLow: false, clampedHigh: false }
      }
      // log already compresses magnitude skew, so robust is opt-in here: clamping would hide the
      // meaningful top/bottom tail (e.g. the largest GDPs) that the log ramp exists to show.
      const posExt = extent(positive) as [number, number]
      const domain = spec.robust ? sequentialDomain(positive, spec.robust) : posExt
      const s = scaleSequentialLog(domain, interp).clamp(true)
      return {
        color: (v) => (v > 0 && Number.isFinite(v) ? s(v) : undefined),
        kind: 'sequential',
        domain,
        extent: posExt,
        ...clampFlags(domain, posExt),
      }
    }
    case 'quantile': {
      const s = scaleQuantile<string>().domain(arr).range(swatches(interp, BUCKETS))
      return {
        color: (v) => (Number.isFinite(v) ? s(v) : undefined),
        kind: 'quantile',
        domain: ext,
        extent: ext,
        breaks: s.quantiles(),
        clampedLow: false,
        clampedHigh: false,
      }
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
      // The shown endpoints are the outermost breaks; values beyond them fall in the open end
      // buckets, so the legend flags those ends against the true extent.
      const domain: [number, number] = [breaks[0]!, breaks[breaks.length - 1]!]
      return {
        color: (v) => (Number.isFinite(v) ? s(v) : undefined),
        kind: 'threshold',
        domain,
        extent: ext,
        ...(spec.diverging ? { pivot: spec.diverging.pivot ?? 0 } : {}),
        breaks,
        ...clampFlags(domain, ext),
      }
    }
    case 'sqrt': // sqrt is a size scale; as a colour fallback behave linear.
    case 'linear':
    default: {
      // A diverging spec splits the ramp around its pivot (signed indicators around zero);
      // otherwise a single sequential ramp over a robust-by-default domain (clamped so outliers
      // pin to the endpoints rather than flattening the ramp for the bulk of the data).
      if (spec.diverging) return makeDivergingLinear(arr, spec)
      const domain = sequentialDomain(arr, spec.robust)
      const s = scaleSequential(domain, interp).clamp(true)
      return {
        color: (v) => (Number.isFinite(v) ? s(v) : undefined),
        kind: 'sequential',
        domain,
        extent: ext,
        ...clampFlags(domain, ext),
      }
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
