// WP-0: render benchmark harness. Dev-only. bench.html is not listed in vite.config's build
// inputs, so it is served by the dev server and excluded from the production bundle.
//
// It mounts one fixed heavy composition through the engine (createMap + buildLayers), then
// measures, from the rendered SVG and performance.now():
//   - node count   : path + circle elements in the DOM after a paint
//   - vertex count : coordinate pairs parsed from the drawn `d` attributes (+ one per glyph circle)
//   - repaint ms   : ms for handle.setLayers(sameLayers), which rebuilds every layer group and
//                    re-projects and repaints in place: a throttle-immune measure of one frame's
//                    render work, the cost WP-1 (culling) and WP-2 (tiers) are meant to cut
//
// Each view is measured at world-fit and zoomed in, on the base tier the composer would load at
// that zoom (tiers.ts tierFor): the globe and polar views past k=6, the flat view at its 12x clamp.
// Zoom is driven by dispatching the engine's wheel handler, which scales the projection and reports
// the zoom ratio synchronously; setLayers then repaints the zoomed projection.
//
// Everything after the data fetches is SYNCHRONOUS: no requestAnimationFrame, no timers. That keeps
// the harness usable when driven headlessly (an automated tab is frozen when not visible, so rAF and
// timers never fire), and it keeps every number throttle-immune.

import { createMap, getView } from '../engine'
import type { ResolvedLayer, ViewId } from '../engine'
import { buildLayers } from './layers'
import type { Binding } from './layers'
import { DEFAULT_TIER, tierFor } from './tiers'
import type { Tier } from './tiers'

const out = document.getElementById('out')!
const mapEl = document.getElementById('map') as HTMLElement
out.textContent = ''

// The fixed heavy composition: a full-map relief surface (many band polygons), land base over it,
// two line networks (plate boundaries + the river network, whose -fine tier loads when zoomed), and
// the historic-quake point layer. Exercises the surface, base, field, and point primitives at once.
const COMPOSITION: Binding[] = [
  { channel: 'surface', dataset: 'elevation' },
  { channel: 'base', dataset: 'land' },
  { channel: 'lane', dataset: 'plate-boundaries' },
  { channel: 'lane', dataset: 'rivers' },
  { channel: 'marker', dataset: 'quakes-historic' },
]

// Views to measure and the zoom ratio to reach in each (the flat view clamps at 12x).
const VIEWS: Array<{ view: ViewId; label: string; zoomTo: number }> = [
  { view: 'orthographic', label: 'Globe', zoomTo: 7 },
  { view: 'azimuthal-equidistant', label: 'Polar', zoomTo: 7 },
  { view: 'equirectangular', label: 'Flat', zoomTo: 12 },
]

const TIERS: Tier[] = ['110m', '50m', '10m']

function log(s: string): void {
  out.textContent += s + '\n'
  console.log('[bench] ' + s)
}

const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi

interface Counts {
  nodes: number
  vertices: number
}

// Nodes and a vertex proxy: coordinate pairs in every path `d`, plus one position per glyph circle.
// This is what the projector had to compute and the DOM had to hold this frame.
function counts(): Counts {
  let vertices = 0
  mapEl.querySelectorAll('path').forEach((p) => {
    const m = p.getAttribute('d')?.match(NUM)
    if (m) vertices += Math.floor(m.length / 2)
  })
  const circles = mapEl.querySelectorAll('circle').length
  return { nodes: mapEl.querySelectorAll('path,circle').length, vertices: vertices + circles }
}

type Stats = { mean: number; p50: number; p95: number }

function stats(xs: number[]): Stats {
  const s = [...xs].sort((a, b) => a - b)
  const q = (p: number): number => s[Math.min(s.length - 1, Math.round(p * (s.length - 1)))]!
  return { mean: xs.reduce((a, b) => a + b, 0) / xs.length, p50: q(0.5), p95: q(0.95) }
}
const fmt = (s: Stats): string => `mean=${s.mean.toFixed(1)} p50=${s.p50.toFixed(1)} p95=${s.p95.toFixed(1)}`

function wheel(deltaY: number): void {
  mapEl.querySelector('svg')?.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }))
}

// Time N calls to setLayers with the same layers: every layer group rebuilt, re-projected and
// repainted in place. Synchronous, so it is the stable before/after number for the render work.
function repaintTimes(handle: { setLayers: (l: ResolvedLayer[]) => void }, layers: ResolvedLayer[], n: number): Stats {
  const t: number[] = []
  for (let i = 0; i < n; i++) {
    const t0 = performance.now()
    handle.setLayers(layers)
    t.push(performance.now() - t0)
  }
  return stats(t)
}

interface ViewResult {
  worldFit: Counts
  zoomed: Counts & { k: number; tier: Tier }
  repaintWorldFit: Stats
  repaintZoomed: Stats
}

function measureView(view: ViewId, label: string, zoomTo: number, layersAt: (tier: Tier) => ResolvedLayer[]): ViewResult {
  log(`\n=== ${label} (${view}) ===`)
  let k = 1
  const handle = createMap(mapEl, { view, layers: layersAt(DEFAULT_TIER), onZoom: (z) => { k = z.k } })
  const worldFit = counts()
  const repaintWorldFit = repaintTimes(handle, layersAt(DEFAULT_TIER), 10)
  log(`world-fit : tier=${DEFAULT_TIER} nodes=${worldFit.nodes} vertices=${worldFit.vertices}`)
  log(`  repaint ms (${fmt(repaintWorldFit)})`)

  // Zoom in one wheel step at a time until the reported ratio reaches zoomTo, then load the tier the
  // composer would pick for that zoom.
  for (let i = 0; i < 40 && k < zoomTo; i++) wheel(-100)
  const tier = tierFor(k, DEFAULT_TIER, !!getView(view).rotatable)
  handle.setLayers(layersAt(tier))
  const zoomed = { ...counts(), k, tier }
  const repaintZoomed = repaintTimes(handle, layersAt(tier), 10)
  log(`zoomed-in : k=${k.toFixed(1)} tier=${tier} nodes=${zoomed.nodes} vertices=${zoomed.vertices}`)
  log(`  repaint ms (${fmt(repaintZoomed)})`)

  handle.destroy()
  return { worldFit, zoomed, repaintWorldFit, repaintZoomed }
}

async function main(): Promise<void> {
  try {
    const tb = performance.now()
    const built = await Promise.all(TIERS.map((tier) => buildLayers(COMPOSITION, undefined, tier)))
    const byTier = new Map(TIERS.map((tier, i) => [tier, built[i]!]))
    for (const [tier, b] of byTier) {
      log(`built ${b.layers.length} layers at ${tier}; failed: ${b.failed.size ? [...b.failed].join(',') : 'none'}`)
    }
    log(`load + shape: ${(performance.now() - tb).toFixed(0)} ms`)
    const layersAt = (tier: Tier): ResolvedLayer[] => byTier.get(tier)!.layers
    // Everything below is synchronous, so it completes in one run even in a frozen headless tab.
    const results = Object.fromEntries(VIEWS.map((v) => [v.label.toLowerCase(), measureView(v.view, v.label, v.zoomTo, layersAt)]))
    ;(window as unknown as { __bench: unknown }).__bench = results // structured readout for a driver
    log('\ndone.')
  } catch (e) {
    log('ERROR: ' + (e instanceof Error ? e.message : String(e)))
  }
}

void main()
