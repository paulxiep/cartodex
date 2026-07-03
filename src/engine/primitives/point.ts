// `point` primitive - markers at coordinates (ports, airports, capitals). Radius maps
// from value when a value table is present, else a constant. Far-side points on a globe
// are dropped via the shared far-side test (see lib/clip).

import type { Feature, Point } from 'geojson'
import type { PrimitiveRenderer, ResolvedLayer, RenderContext, SvgGroup } from '../types'
import { radiusScale, valueOf } from '../lib/scales'
import { farSideTest } from '../lib/clip'
import { showTooltip, hideTooltip } from '../lib/tooltip'

interface PlacedPoint {
  x: number
  y: number
  r: number
  feature: Feature
}

function pointCoord(f: Feature): [number, number] | null {
  if (f.geometry?.type !== 'Point') return null
  const c = (f.geometry as Point).coordinates
  return [c[0] ?? 0, c[1] ?? 0]
}

function label(f: Feature): string {
  return (f.properties?.['name'] as string | undefined) ?? String(f.id ?? 'point')
}

export const pointRenderer: PrimitiveRenderer = {
  drawSVG(group: SvgGroup, layer: ResolvedLayer, ctx: RenderContext) {
    const domain = layer.valueDomain ?? [0, 1]
    const r = radiusScale(domain, layer.style.radiusRange ?? [1.5, 7])
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
    group
      .selectAll<SVGCircleElement, PlacedPoint>('circle')
      .data(placed)
      .join('circle')
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y)
      .attr('r', (d) => d.r)
      .attr('fill', layer.style.fill ?? '#ffcc44')
      .attr('stroke', layer.style.stroke ?? 'rgba(0,0,0,0.5)')
      .attr('stroke-width', layer.style.strokeWidth ?? 0.4)
      .attr('opacity', layer.style.opacity ?? 0.9)
      .on('pointermove', (e: PointerEvent, d) => showTooltip(label(d.feature), e.clientX, e.clientY))
      .on('pointerleave', hideTooltip)
  },
}
