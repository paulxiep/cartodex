// The colour legend: for each active colour channel, a compact swatch strip with domain
// endpoints so a reader can map colour back to value. It resolves each entry through the
// engine's `resolveColorScale` - the SAME resolver the primitives fill with - and samples the
// returned `color` for its swatches, so the legend can never drift from the map. Sequential and
// diverging scales render as a sampled gradient; quantile and threshold render as discrete bands.
// Endpoints show `≤`/`≥` when the domain is clamped, and a centre tick at the pivot when diverging.

import { resolveColorScale } from '../engine'
import type { ResolvedScale } from '../engine'
import type { LegendEntry } from './layers'

const RAMP_SAMPLES = 24

/** Compact number format: magnitudes get k/M/B, mid values round to integers, small keep decimals. */
function fmt(v: number): string {
  if (!Number.isFinite(v)) return ''
  const a = Math.abs(v)
  if (a === 0) return '0'
  if (a >= 10000) return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
  if (a >= 100) return Math.round(v).toLocaleString()
  if (a >= 1) return String(Math.round(v * 10) / 10)
  return String(Math.round(v * 100) / 100)
}

/** A continuous gradient sampled from the resolved colour function across the shown domain. */
function gradientStrip(rs: ResolvedScale): HTMLElement {
  const [lo, hi] = rs.domain
  const stops = Array.from({ length: RAMP_SAMPLES }, (_, i) => {
    const t = i / (RAMP_SAMPLES - 1)
    return rs.color(lo + (hi - lo) * t) ?? 'transparent'
  })
  const strip = document.createElement('div')
  strip.className = 'legend-strip'
  strip.style.background = `linear-gradient(to right, ${stops.join(',')})`
  return strip
}

/** A discrete band strip: one cell per bucket, coloured by sampling the scale inside each band. */
function bandStrip(rs: ResolvedScale): HTMLElement {
  const b = rs.breaks ?? []
  const strip = document.createElement('div')
  strip.className = 'legend-strip legend-bands'
  // n breaks make n+1 bands; sample each band's midpoint (open ends extrapolated by one gap) so
  // the cell colour equals the bucket colour the renderer uses.
  const reps: number[] = []
  for (let i = 0; i <= b.length; i++) {
    const lo = i === 0 ? 2 * b[0]! - (b[1] ?? b[0]! + 1) : b[i - 1]!
    const hi = i === b.length ? 2 * b[b.length - 1]! - (b[b.length - 2] ?? b[b.length - 1]! - 1) : b[i]!
    reps.push((lo + hi) / 2)
  }
  for (const v of reps) {
    const cell = document.createElement('div')
    cell.className = 'legend-cell'
    cell.style.background = rs.color(v) ?? 'transparent'
    strip.appendChild(cell)
  }
  return strip
}

function entryEl(entry: LegendEntry): HTMLElement {
  const rs = resolveColorScale(entry.values, entry.scale)
  const el = document.createElement('div')
  el.className = 'legend-entry'

  const title = document.createElement('div')
  title.className = 'legend-title'
  title.textContent = entry.label
  el.appendChild(title)

  el.appendChild(rs.kind === 'sequential' || rs.kind === 'diverging' ? gradientStrip(rs) : bandStrip(rs))

  const scale = document.createElement('div')
  scale.className = 'legend-scale'
  const low = document.createElement('span')
  low.textContent = (rs.clampedLow ? '≤ ' : '') + fmt(rs.domain[0])
  scale.appendChild(low)
  if (rs.pivot != null) {
    const mid = document.createElement('span')
    mid.className = 'legend-pivot'
    mid.textContent = fmt(rs.pivot)
    scale.appendChild(mid)
  }
  const high = document.createElement('span')
  high.textContent = (rs.clampedHigh ? '≥ ' : '') + fmt(rs.domain[1])
  scale.appendChild(high)
  el.appendChild(scale)

  return el
}

/** Render (or clear) the legend for the active colour channels. Hidden when there are none. */
export function renderLegend(container: HTMLElement, entries: LegendEntry[]): void {
  container.replaceChildren(...entries.map(entryEl))
  container.hidden = entries.length === 0
}
