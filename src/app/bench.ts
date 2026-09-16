// WP-0: render benchmark harness. Dev-only. bench.html is not listed in vite.config's build
// inputs, so it is served by the dev server and excluded from the production bundle.
//
// It mounts one fixed heavy composition through the real engine (createMap + buildLayers), then
// measures, from the REAL rendered SVG and the REAL clock:
//   - node count   : path + circle elements actually in the DOM after a paint
//   - vertex count : coordinate pairs parsed from the drawn `d` attributes (+ one per glyph circle)
//   - rebuild ms   : ms for handle.setLayers(sameLayers), a full teardown + re-project + repaint of
//                    every layer; a throttle-immune upper bound on the per-frame paint cost that
//                    WP-1 (culling) and WP-2 (tiers) are meant to cut
//
// Measured at world-fit and again zoomed-in, on the globe (orthographic) and a flat view
// (equirectangular), so both the hemisphere-cap and rect-window culling paths have a baseline.
//
// Everything after the single data fetch is SYNCHRONOUS: no requestAnimationFrame, no timers. That
// keeps the harness usable when driven headlessly (an automated tab is frozen when not visible, so
// rAF/timers never fire), and it keeps every number throttle-immune. Zoom is driven by dispatching
// the real wheel handler synchronously and forcing a synchronous re-render; the flat view persists
// its zoom synchronously so it re-measures zoomed-in, while the globe persists its scale only inside
// a rAF, so a headless globe re-measures near world-fit (the globe's cull win already shows at
// world-fit via the far-side cap). No synthetic numbers: every figure is read off the real DOM.

import { createMap } from '../engine'
import type { ViewId } from '../engine'
import { buildLayers } from './layers'
import type { Binding } from './layers'

const out = document.getElementById('out')!
const mapEl = document.getElementById('map') as HTMLElement
out.textContent = ''

// The fixed heavy composition: a full-map relief surface (many band polygons), land base over it,
// two line networks (plate boundaries + the ~1.9 MB river network), and the historic-quake point
// layer. Exercises the surface, base, field, and point primitives at once.
const COMPOSITION: Binding[] = [
  { channel: 'surface', dataset: 'elevation' },
  { channel: 'base', dataset: 'land' },
  { channel: 'lane', dataset: 'plate-boundaries' },
  { channel: 'lane', dataset: 'rivers' },
  { channel: 'marker', dataset: 'quakes-historic' },
]

function log(s: string): void {
  out.textContent += s + '\n'
  console.log('[bench] ' + s)
}

const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi

function countNodes(): number {
  return mapEl.querySelectorAll('path,circle').length
}

// Vertex proxy: sum of coordinate pairs in every path `d`, plus one position per glyph circle.
// This is what the projector actually had to compute and the DOM had to hold this frame.
function countVertices(): number {
  let n = 0
  mapEl.querySelectorAll('path').forEach((p) => {
    const d = p.getAttribute('d')
    if (!d) return
    const m = d.match(NUM)
    if (m) n += Math.floor(m.length / 2)
  })
  n += mapEl.querySelectorAll('circle').length
  return n
}

function stats(xs: number[]): { mean: number; p50: number; p95: number } {
  const s = [...xs].sort((a, b) => a - b)
  const q = (p: number): number => s[Math.min(s.length - 1, Math.round(p * (s.length - 1)))]!
  return { mean: xs.reduce((a, b) => a + b, 0) / xs.length, p50: q(0.5), p95: q(0.95) }
}
const fmt = (s: { mean: number; p50: number; p95: number }): string =>
  `mean=${s.mean.toFixed(1)} p50=${s.p50.toFixed(1)} p95=${s.p95.toFixed(1)}`

function wheel(deltaY: number): void {
  mapEl.querySelector('svg')?.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }))
}

// Time N calls to setLayers with the same layers: a full teardown + re-project + repaint of every
// feature. Synchronous, so it is the stable before/after number for the render work.
function rebuildTimes(handle: { setLayers: (l: ResolvedLayers) => void }, layers: ResolvedLayers, n: number): number[] {
  const t: number[] = []
  for (let i = 0; i < n; i++) {
    const t0 = performance.now()
    handle.setLayers(layers)
    t.push(performance.now() - t0)
  }
  return t
}

type ResolvedLayers = Awaited<ReturnType<typeof buildLayers>>['layers']

interface Counts {
  nodes: number
  vertices: number
}
interface ViewResult {
  worldFit: Counts
  zoomed: Counts
  rebuildWorldFit: { mean: number; p50: number; p95: number }
  rebuildZoomed: { mean: number; p50: number; p95: number }
}

function measureView(view: ViewId, label: string, layers: ResolvedLayers): ViewResult {
  log(`\n=== ${label} (${view}) ===`)
  const handle = createMap(mapEl, { view, layers }) // synchronous initial paint at world-fit
  const worldFit: Counts = { nodes: countNodes(), vertices: countVertices() }
  const rebuildWorldFit = stats(rebuildTimes(handle, layers, 10))
  log(`world-fit : nodes=${worldFit.nodes} vertices=${worldFit.vertices}`)
  log(`  rebuild ms (${fmt(rebuildWorldFit)})`)

  // Zoom in synchronously: 16 wheel steps reach the flat 12x clamp; each wheel handler mutates the
  // projection scale synchronously (flat also persists its zoom), then setLayers forces a synchronous
  // re-render at the persisted zoom so the counts below reflect the zoomed-in state.
  for (let i = 0; i < 16; i++) wheel(-100)
  handle.setLayers(layers)
  const zoomed: Counts = { nodes: countNodes(), vertices: countVertices() }
  const rebuildZoomed = stats(rebuildTimes(handle, layers, 10))
  log(`zoomed-in : nodes=${zoomed.nodes} vertices=${zoomed.vertices}`)
  log(`  rebuild ms (${fmt(rebuildZoomed)})`)

  handle.destroy()
  mapEl.replaceChildren()
  return { worldFit, zoomed, rebuildWorldFit, rebuildZoomed }
}

async function main(): Promise<void> {
  try {
    const tb = performance.now()
    const { layers, failed } = await buildLayers(COMPOSITION) // the one async step, at load
    log(`built ${layers.length} layers in ${(performance.now() - tb).toFixed(0)} ms; failed: ${failed.size ? [...failed].join(',') : 'none'}`)
    // Everything below is synchronous, so it completes in one run even in a frozen headless tab.
    const results = {
      globe: measureView('orthographic', 'Globe', layers),
      flat: measureView('equirectangular', 'Flat', layers),
    }
    ;(window as unknown as { __bench: unknown }).__bench = results // structured readout for a driver
    log('\ndone.')
  } catch (e) {
    log('ERROR: ' + (e instanceof Error ? e.message : String(e)))
  }
}

void main()
