// `region-symbol` primitive: a proportional bubble at each region's centroid, sized by the
// region's value (sqrt, so area is proportional). The composable size encoding for region
// data - it reads magnitudes (population, GDP) as bubbles instead of a near-monochrome
// choropleth, and coexists with a choropleth on the same map (bivariate).
//
// Centroid via d3 geoCentroid (spherical) then projected, so it tracks every view; bubbles
// on the hidden hemisphere of a globe are dropped via the shared far-side test. Larger
// bubbles draw first so smaller ones stay clickable on top.

import { geoCentroid } from 'd3-geo'
import type { Feature } from 'geojson'
import type { PrimitiveRenderer, ResolvedLayer, RenderContext, SvgGroup } from '../types'
import { radiusScale } from '../lib/scales'
import { farSideTest } from '../lib/clip'
import { showTooltip, hideTooltip } from '../lib/tooltip'

interface PlacedBubble {
  x: number
  y: number
  r: number
  feature: Feature
  value: number
}

function label(f: Feature, value: number): string {
  const name = (f.properties?.['name'] as string | undefined) ?? String(f.id ?? '')
  return `${name}: ${value.toLocaleString()}`
}

export const regionSymbolRenderer: PrimitiveRenderer = {
  drawSVG(group: SvgGroup, layer: ResolvedLayer, ctx: RenderContext) {
    const domain = layer.valueDomain ?? [0, 1]
    const r = radiusScale(domain, layer.style.radiusRange ?? [2, 26])
    const isFarSide = farSideTest(ctx)
    const placed: PlacedBubble[] = []
    for (const f of layer.features.features) {
      const v = f.id == null ? undefined : layer.values?.get(f.id)
      // Proportional area needs a positive magnitude: non-positive values (e.g. a signed
      // indicator like net migration) are no-data for sizing, not a zero/negative bubble.
      if (v == null || !(v > 0)) continue
      const c = geoCentroid(f) as [number, number]
      if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue
      if (isFarSide?.(c)) continue
      const xy = ctx.projector.project(c)
      if (!xy) continue
      placed.push({ x: xy[0], y: xy[1], r: r(v), feature: f, value: v })
    }
    placed.sort((a, b) => b.r - a.r) // large first, small marks stay on top

    group
      .selectAll<SVGCircleElement, PlacedBubble>('circle')
      .data(placed)
      .join('circle')
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y)
      .attr('r', (d) => d.r)
      .attr('fill', layer.style.fill ?? 'rgba(255,140,60,0.55)')
      .attr('stroke', layer.style.stroke ?? 'rgba(20,10,0,0.6)')
      .attr('stroke-width', layer.style.strokeWidth ?? 0.5)
      .attr('opacity', layer.style.opacity ?? 0.85)
      .on('pointermove', (e: PointerEvent, d) => showTooltip(label(d.feature, d.value), e.clientX, e.clientY))
      .on('pointerleave', hideTooltip)
  },
}
