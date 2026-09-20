// `point` primitive - markers at coordinates (ports, airports, capitals). Radius maps from value
// when a value table is present, else a constant. Off-viewport marks are dropped by the viewport
// cull before drawing (padded by the largest glyph); an exact far-side test (lib/cull farSideTest)
// hides marks on a globe's hidden hemisphere.

import type { Feature, Point } from 'geojson'
import type { MarkerShape, PrimitiveRenderer, ResolvedLayer, RenderContext, SvgGroup } from '../types'
import { radiusScale, valueOf } from '../lib/scales'
import { farSideTest } from '../lib/cull'
import { showTooltip, hideTooltip } from '../lib/tooltip'

interface PlacedPoint {
  x: number
  y: number
  r: number
  feature: Feature
}

const RADIUS_RANGE: [number, number] = [1.5, 7]
// The farthest any glyph reaches from its centre, in radii (the lifted point-up triangle).
const GLYPH_REACH = 1.1

function pointCoord(f: Feature): [number, number] | null {
  if (f.geometry?.type !== 'Point') return null
  const c = (f.geometry as Point).coordinates
  return [c[0] ?? 0, c[1] ?? 0]
}

// A marker glyph as an SVG path centred at (x,y) with radius r, so every shape shares one <path>
// join (uniform fill/stroke/tooltip handling). Circle is drawn as two half-arcs; the polygons use
// r as the circumradius (triangle point-up, square, diamond) tuned so the shapes read at similar
// visual weight to a circle of the same r.
function symbolPath(shape: MarkerShape | undefined, x: number, y: number, r: number): string {
  switch (shape) {
    case 'triangle': {
      const h = r * GLYPH_REACH // lift so the point-up triangle balances a circle of radius r
      return `M${x},${y - h} L${x + h * 0.9},${y + h * 0.6} L${x - h * 0.9},${y + h * 0.6} Z`
    }
    case 'square': {
      const s = r * 0.9
      return `M${x - s},${y - s} H${x + s} V${y + s} H${x - s} Z`
    }
    case 'diamond':
      return `M${x},${y - r} L${x + r},${y} L${x},${y + r} L${x - r},${y} Z`
    case 'circle':
    default:
      return `M${x - r},${y} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0 Z`
  }
}

function label(f: Feature): string {
  return (f.properties?.['name'] as string | undefined) ?? String(f.id ?? 'point')
}

export const pointRenderer: PrimitiveRenderer = {
  drawSVG(group: SvgGroup, layer: ResolvedLayer, ctx: RenderContext) {
    const domain = layer.valueDomain ?? [0, 1]
    const r = radiusScale(domain, layer.style.radiusRange ?? RADIUS_RANGE)
    // The viewport cull has already dropped off-screen marks. d3 folds the far hemisphere onto the disc
    // rather than returning null for it, so an exact horizon test hides far-side marks.
    const isFarSide = farSideTest(ctx)
    const placed: PlacedPoint[] = []
    for (const f of layer.features.features) {
      const lonlat = pointCoord(f)
      if (!lonlat) continue
      if (isFarSide?.(lonlat)) continue
      const xy = ctx.projector.project(lonlat)
      if (!xy) continue
      const v = valueOf(layer, f)
      placed.push({ x: xy[0], y: xy[1], r: v == null ? 2 : r(v), feature: f })
    }
    const shape = layer.style.shape
    group
      .selectAll<SVGPathElement, PlacedPoint>('path')
      .data(placed)
      .join('path')
      .attr('d', (d) => symbolPath(shape, d.x, d.y, d.r))
      .attr('fill', layer.style.fill ?? '#ffcc44')
      .attr('stroke', layer.style.stroke ?? 'rgba(0,0,0,0.5)')
      .attr('stroke-width', layer.style.strokeWidth ?? 0.4)
      .attr('opacity', layer.style.opacity ?? 0.9)
      .on('pointermove', (e: PointerEvent, d) => showTooltip(label(d.feature), e.clientX, e.clientY))
      .on('pointerleave', hideTooltip)
  },
  cullPadding: (layer) => GLYPH_REACH * (layer.style.radiusRange ?? RADIUS_RANGE)[1] + (layer.style.strokeWidth ?? 0.4),
}
