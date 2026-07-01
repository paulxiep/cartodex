// The engine's one entry point. createMap mounts a map into a container as an <svg>
// rendered with d3-geo. Layers are drawn through their primitive renderers;
// incompatible (view, primitive) cells are skipped.

import { select } from 'd3-selection'
import { drag } from 'd3-drag'
import { zoom, zoomIdentity } from 'd3-zoom'
import type { ZoomTransform } from 'd3-zoom'
import { geoGraticule10 } from 'd3-geo'
import type { Selection } from 'd3-selection'
import type { GeoGeometryObjects, GeoProjection } from 'd3-geo'
import type {
  MapHandle,
  MapOptions,
  ResolvedLayer,
  RenderContext,
  SvgGroup,
  ViewId,
} from './types'

type SvgSelection = Selection<SVGSVGElement, unknown, null, undefined>

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
      const factor = event.deltaY < 0 ? 1.1 : 0.9
      projection.scale(Math.max(40, projection.scale() * factor))
      schedule()
    },
    { passive: false },
  )
}
import { getView } from './views'
import { getPrimitive } from './primitives'
import { compatible } from './compatible'
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
  let savedRotate: [number, number, number] | null = null
  let savedScale: number | null = null
  let savedZoom: ZoomTransform | null = null

  function teardown(): void {
    container.replaceChildren()
  }

  function renderSvg(width: number, height: number): void {
    const view = getView(viewId)
    const projector = view.build(width, height)
    // Restore a globe/polar orientation carried over from a previous render (before the
    // first paint, so the restored view shows immediately).
    if (view.rotatable && projector.projection) {
      if (savedRotate) projector.projection.rotate(savedRotate)
      if (savedScale != null) projector.projection.scale(savedScale)
    }
    const ctx: RenderContext = { view, projector, width, height }

    const svg = select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('display', 'block')
      .style('background', '#0c0e12')

    const root = svg.append('g').attr('class', 'cartodex-root')

    // Sphere outline + graticule behind the layers, for projection views.
    const hasBackground = projector.path != null
    const spherePath = hasBackground
      ? root.append('path').attr('class', 'cartodex-sphere').attr('fill', '#10151c').attr('stroke', '#272d36').attr('stroke-width', 1)
      : null
    const gratPath = hasBackground
      ? root.append('path').attr('class', 'cartodex-graticule').attr('fill', 'none').attr('stroke', 'rgba(120,140,170,0.12)').attr('stroke-width', 0.5)
      : null

    const layerGroups: Array<{ group: SvgGroup; layer: ResolvedLayer }> = []
    for (const layer of layers) {
      if (!compatible(view, layer.primitive)) continue
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
      for (const { group, layer } of layerGroups) {
        group.selectAll('*').remove()
        getPrimitive(layer.primitive).drawSVG(group, layer, ctx)
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
        savedScale = proj.scale()
        paint()
      })
    } else {
      // Flat/cartogram views: pan + zoom by transforming the root group.
      const zoomBehavior = zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.6, 12])
        .on('zoom', (event) => {
          savedZoom = event.transform
          root.attr('transform', event.transform.toString())
        })
      svg.call(zoomBehavior)
      svg.call(zoomBehavior.transform, savedZoom ?? zoomIdentity)
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
      // A deliberate view switch starts from that view's default orientation.
      savedRotate = null
      savedScale = null
      savedZoom = null
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
