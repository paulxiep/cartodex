// The engine's one entry point. createMap mounts a map into a container as an <svg>
// rendered with d3-geo. Layers are drawn through their primitive renderers, in order. The
// app enforces (view × channel) compatibility when it resolves bindings, so the renderer
// draws whatever layers it is handed.

import { select } from 'd3-selection'
import { drag } from 'd3-drag'
import { geoGraticule10 } from 'd3-geo'
import type { Selection } from 'd3-selection'
import type { GeoGeometryObjects, GeoPath, GeoProjection } from 'd3-geo'
import type {
  MapHandle,
  MapOptions,
  ResolvedLayer,
  RenderContext,
  SvgGroup,
  ViewId,
} from './types'

type SvgSelection = Selection<SVGSVGElement, unknown, null, undefined>

// Per-wheel-event zoom factor. Exponential in deltaY so zoom is proportional to scroll intensity and
// symmetric (in/out are inverses); a mouse notch (deltaY ~100) gives ~1.25x (was a flat 1.1), while a
// trackpad's many small deltas stay smooth. deltaY is clamped so one oversized or line-mode event
// can't jump wildly. Raise ZOOM_WHEEL_RATE for faster zoom.
const ZOOM_WHEEL_RATE = 0.0022
function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-Math.max(-120, Math.min(120, deltaY)) * ZOOM_WHEEL_RATE)
}

/**
 * Globe-like interaction for a d3 projection: drag rotates the projection center
 * (re-centering the polar map / spinning the orthographic globe), wheel zooms by
 * scaling the projection. Repaint is throttled to one animation frame.
 */
function attachRotate(svg: SvgSelection, projection: GeoProjection, onChange: () => void): void {
  let raf = 0
  const schedule = (): void => {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; onChange() })
  }

  const dragBehavior = drag<SVGSVGElement, unknown>().on('drag', (event) => {
    const k = 75 / projection.scale()
    const [lambda, phi, gamma] = projection.rotate()
    projection.rotate([lambda + event.dx * k, phi - event.dy * k, gamma])
    schedule()
  })
  svg.call(dragBehavior).style('cursor', 'grab')

  svg.node()?.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault()
      projection.scale(Math.max(40, projection.scale() * wheelZoomFactor(event.deltaY)))
      schedule()
    },
    { passive: false },
  )
}

/**
 * Keep a flat (non-rotatable) projection's world covering the viewport: nudge `translate` so the
 * projected sphere bbox has no gap against the [0,0,width,height] frame (no empty margin), or centre
 * a dimension the world is smaller than (equal-earth's rounded shape at world-fit). Called after any
 * pan/zoom and on restore, so a flat map can never be dragged or zoomed off into empty space.
 */
function clampFlatPan(projection: GeoProjection, path: GeoPath, width: number, height: number): void {
  const b = path.bounds(sphere)
  const [[x0, y0], [x1, y1]] = b
  const [tx, ty] = projection.translate()
  const wW = x1 - x0
  const wH = y1 - y0
  // If the world is at least as wide/tall as the frame, close any gap at an edge; otherwise centre
  // that axis (equal-earth's rounded shape at world-fit).
  const ax = wW >= width ? (x0 > 0 ? -x0 : x1 < width ? width - x1 : 0) : (width - (x0 + x1)) / 2
  const ay = wH >= height ? (y0 > 0 ? -y0 : y1 < height ? height - y1 : 0) : (height - (y0 + y1)) / 2
  if (ax !== 0 || ay !== 0) projection.translate([tx + ax, ty + ay])
}
import { getView } from './views'
import { getPrimitive } from './primitives'
import { makeCull } from './lib/cull'
import { SPHERE } from './views/_svgProjector'

const sphere = SPHERE as unknown as GeoGeometryObjects

function sizeOf(container: HTMLElement): [number, number] {
  const w = container.clientWidth || 900
  const h = container.clientHeight || 540
  return [w, h]
}

export function createMap(container: HTMLElement, options: MapOptions): MapHandle {
  let viewId: ViewId = options.view
  let layers: ResolvedLayer[] = options.layers

  // Interaction state persists across re-renders (a layer toggle or resize rebuilds the
  // SVG, but must not reset the user's orientation). Cleared only on an explicit setView.
  // Zoom is stored as a RATIO to the view's fitSize baseline (not an absolute px scale),
  // so a resize still refits the view while keeping the user's zoom level. Rotatable views keep
  // a rotation + scale ratio; flat views keep a scale ratio + a pan offset (px from fit-centre).
  let savedRotate: [number, number, number] | null = null
  let savedScaleK: number | null = null
  let savedFlatK = 1
  let savedPan: [number, number] = [0, 0]

  function teardown(): void {
    container.replaceChildren()
  }

  function renderSvg(width: number, height: number): void {
    const view = getView(viewId)
    const projector = view.build(width, height)
    // Restore a globe/polar orientation carried over from a previous render (before the
    // first paint, so the restored view shows immediately). Scale is applied as a ratio of
    // this size's fitSize baseline, so the globe stays fit after a resize.
    const baseRotatableScale =
      view.rotatable && projector.projection ? projector.projection.scale() : null
    if (view.rotatable && projector.projection) {
      if (savedRotate) projector.projection.rotate(savedRotate)
      if (savedScaleK != null && baseRotatableScale) projector.projection.scale(baseRotatableScale * savedScaleK)
    }

    // Flat views: the fitSize baseline (scale + centre translate) to restore a saved zoom/pan
    // against, so a resize refits while keeping the user's zoom and position.
    const flatProjection = !view.rotatable && projector.projection ? projector.projection : null
    const baseFlatScale = flatProjection ? flatProjection.scale() : null
    const baseFlatTranslate = flatProjection ? flatProjection.translate() : null
    if (flatProjection && baseFlatScale != null && baseFlatTranslate != null) {
      flatProjection.scale(baseFlatScale * savedFlatK)
      flatProjection.translate([baseFlatTranslate[0] + savedPan[0], baseFlatTranslate[1] + savedPan[1]])
      if (projector.path) clampFlatPan(flatProjection, projector.path, width, height)
    }
    const ctx: RenderContext = { view, projector, width, height }

    const svg = select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('display', 'block')
      .style('background', '#06080c')

    const root = svg.append('g').attr('class', 'cartodex-root')

    // Sphere outline + graticule behind the layers, for projection views.
    const hasBackground = projector.path != null
    const spherePath = hasBackground
      ? root.append('path').attr('class', 'cartodex-sphere').attr('fill', '#0d1826').attr('stroke', '#3a4657').attr('stroke-width', 1)
      : null
    const gratPath = hasBackground
      ? root.append('path').attr('class', 'cartodex-graticule').attr('fill', 'none').attr('stroke', 'rgba(130,150,180,0.16)').attr('stroke-width', 0.5)
      : null

    const layerGroups: Array<{ group: SvgGroup; layer: ResolvedLayer }> = []
    for (const layer of layers) {
      const group = root.append('g').attr('class', `layer-${layer.primitive} layer-${layer.id}`)
      layerGroups.push({ group, layer })
    }

    // Marker at the projection center (drawn on top), for azimuthal / polar readability.
    const centerGroup =
      view.showCenter && projector.projection ? root.append('g').attr('class', 'cartodex-center') : null

    // Re-run all layer draws (and the sphere/graticule) against the current projector.
    // Used both for the initial paint and on every rotate/zoom tick of a globe-like view.
    function paint(): void {
      const path = projector.path
      if (path) {
        spherePath?.attr('d', path(sphere) ?? '')
        gratPath?.attr('d', path(geoGraticule10()) ?? '')
      }
      // Build the viewport cull once per frame from the current (mutated) projector; a per-frame
      // context carries it to each primitive. Absent (world-fit flat, whole-sphere polar) means
      // draw everything.
      const cull = makeCull(ctx) ?? undefined
      const frameCtx: RenderContext = cull ? { ...ctx, cull } : ctx
      for (const { group, layer } of layerGroups) {
        group.selectAll('*').remove()
        getPrimitive(layer.primitive).drawSVG(group, layer, frameCtx)
      }
      if (centerGroup && projector.projection) {
        centerGroup.selectAll('*').remove()
        const rot = projector.projection.rotate()
        const c = projector.projection([-rot[0], -rot[1]])
        if (c) {
          centerGroup
            .append('circle')
            .attr('cx', c[0]).attr('cy', c[1]).attr('r', 5)
            .attr('fill', 'none').attr('stroke', 'rgba(235,235,240,0.85)').attr('stroke-width', 1.2)
          centerGroup
            .append('circle')
            .attr('cx', c[0]).attr('cy', c[1]).attr('r', 1.3)
            .attr('fill', 'rgba(235,235,240,0.9)')
        }
      }
    }

    paint()

    if (view.rotatable && projector.projection) {
      const proj = projector.projection
      attachRotate(svg, proj, () => {
        savedRotate = proj.rotate()
        savedScaleK = baseRotatableScale ? proj.scale() / baseRotatableScale : null
        paint()
      })
    } else if (flatProjection && projector.path && baseFlatScale != null && baseFlatTranslate != null) {
      // Flat views: pan + zoom by re-projecting (mutate scale/translate + repaint), the same model
      // the globe uses - so geometry stays crisp and strokes keep their width at every zoom, rather
      // than magnifying a pre-rendered group. Zoom is clamped to [1x, 12x] of the world-fit so the
      // map can never shrink below the frame, and pan is clamped so it can't leave empty margins.
      const proj = flatProjection
      const flatPath = projector.path
      const baseScale = baseFlatScale
      const baseTranslate = baseFlatTranslate
      let raf = 0
      const schedule = (): void => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint() }) }
      const persist = (): void => {
        savedFlatK = proj.scale() / baseScale
        const [tx, ty] = proj.translate()
        savedPan = [tx - baseTranslate[0], ty - baseTranslate[1]]
      }
      const dragBehavior = drag<SVGSVGElement, unknown>().on('drag', (event) => {
        const [tx, ty] = proj.translate()
        proj.translate([tx + event.dx, ty + event.dy])
        clampFlatPan(proj, flatPath, width, height)
        persist()
        schedule()
      })
      svg.call(dragBehavior).style('cursor', 'grab')
      svg.node()?.addEventListener(
        'wheel',
        (event) => {
          event.preventDefault()
          const k0 = proj.scale() / baseScale
          const k = Math.max(1, Math.min(12, k0 * wheelZoomFactor(event.deltaY)))
          const ratio = k / k0
          const cx = width / 2
          const cy = height / 2
          const [tx, ty] = proj.translate()
          proj.scale(baseScale * k)
          proj.translate([cx + (tx - cx) * ratio, cy + (ty - cy) * ratio])
          clampFlatPan(proj, flatPath, width, height)
          persist()
          schedule()
        },
        { passive: false },
      )
    }
  }

  function render(): void {
    teardown()
    const [width, height] = sizeOf(container)
    renderSvg(width, height)
  }

  render()

  let resizeRaf = 0
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(resizeRaf)
    resizeRaf = requestAnimationFrame(render)
  })
  ro.observe(container)

  return {
    setView(next: ViewId) {
      viewId = next
      // A deliberate view switch starts from that view's default orientation and zoom.
      savedRotate = null
      savedScaleK = null
      savedFlatK = 1
      savedPan = [0, 0]
      render()
    },
    setLayers(next: ResolvedLayer[]) {
      layers = next
      render()
    },
    destroy() {
      ro.disconnect()
      cancelAnimationFrame(resizeRaf)
      teardown()
    },
  }
}
