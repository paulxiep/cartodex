// `point` primitive - markers at coordinates (ports, airports, capitals). Radius maps
// from value when a value table is present, else a constant.
//
// Back-hemisphere hiding: d3's projection() maps both hemispheres onto the disc and
// does NOT clip points the way geoPath clips areas/lines, so on a clipped projection
// (e.g. orthographic, clipAngle 90) far-side points would still be drawn. We drop any
// point whose great-arc distance from the projection center exceeds the clip angle.

import { geoDistance } from 'd3-geo'
import type { Feature, Point } from 'geojson'
import type { PrimitiveRenderer, ResolvedLayer, RenderContext, SvgGroup } from '../types'
import { radiusScale, valueOf } from '../lib/scales'
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

// Returns a predicate that is true when a lon/lat is on the hidden far hemisphere of
// the active projection, or null when the projection clips nothing worth hiding
// (e.g. equirectangular has no clip angle; azimuthal-equidistant clips near 180 deg).
function farSideTest(ctx: RenderContext): ((lonlat: [number, number]) => boolean) | null {
  const projection = ctx.projector.projection
  if (!projection) return null
  const clip = projection.clipAngle() as number | null
  if (clip == null || clip >= 180) return null
  const rot = projection.rotate()
  const center: [number, number] = [-rot[0], -rot[1]]
  const maxDist = (clip * Math.PI) / 180
  return (lonlat) => geoDistance(center, lonlat) > maxDist
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
