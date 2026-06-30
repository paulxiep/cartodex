// `region` primitive: per-region values. Two layouts depending on the active view:
//   normal projection       -> choropleth fill by value
//   cartogram:noncontiguous -> each region scaled in place around its centroid
// The region primitive owns the cartogram distortion because it owns the values.

import type { Feature } from 'geojson'
import type { PrimitiveRenderer, ResolvedLayer, RenderContext, SvgGroup } from '../types'
import { choropleth, valueOf } from '../lib/scales'
import { showTooltip, hideTooltip } from '../lib/tooltip'

function domainOf(layer: ResolvedLayer): [number, number] {
  return layer.valueDomain ?? [0, 1]
}

function label(feature: Feature, value: number | undefined): string {
  const name = (feature.properties?.['name'] as string | undefined) ?? String(feature.id ?? '')
  return value == null ? name : `${name}: ${value.toLocaleString()}`
}

function drawChoropleth(group: SvgGroup, layer: ResolvedLayer, ctx: RenderContext): void {
  const path = ctx.projector.path
  if (!path) return
  const color = choropleth(domainOf(layer), layer.style.ramp)
  group
    .selectAll<SVGPathElement, Feature>('path')
    .data(layer.features.features)
    .join('path')
    .attr('d', (f) => path(f) ?? '')
    .attr('fill', (f) => {
      const v = valueOf(layer, f)
      return v == null ? '#222831' : color(v)
    })
    .attr('stroke', layer.style.stroke ?? 'rgba(0,0,0,0.25)')
    .attr('stroke-width', layer.style.strokeWidth ?? 0.4)
    .on('pointermove', (e: PointerEvent, f) => showTooltip(label(f, valueOf(layer, f)), e.clientX, e.clientY))
    .on('pointerleave', hideTooltip)
}

function drawNoncontiguous(group: SvgGroup, layer: ResolvedLayer, ctx: RenderContext): void {
  const path = ctx.projector.path
  if (!path) return
  const [, max] = domainOf(layer)
  const color = choropleth(domainOf(layer), layer.style.ramp)

  group
    .selectAll<SVGPathElement, Feature>('path')
    .data(layer.features.features)
    .join('path')
    .attr('d', (f) => path(f) ?? '')
    .attr('fill', (f) => {
      const v = valueOf(layer, f)
      return v == null ? '#222831' : color(v)
    })
    .attr('stroke', 'rgba(0,0,0,0.3)')
    .attr('stroke-width', 0.4)
    .attr('transform', (f) => {
      const v = valueOf(layer, f)
      if (v == null || max <= 0) return null
      const k = Math.sqrt(Math.max(v, 0) / max)
      const [cx, cy] = path.centroid(f)
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
      return `translate(${cx},${cy}) scale(${k}) translate(${-cx},${-cy})`
    })
    .on('pointermove', (e: PointerEvent, f) => showTooltip(label(f, valueOf(layer, f)), e.clientX, e.clientY))
    .on('pointerleave', hideTooltip)
}

export const regionRenderer: PrimitiveRenderer = {
  drawSVG(group, layer, ctx) {
    if (ctx.view.cartogramKind === 'noncontiguous') drawNoncontiguous(group, layer, ctx)
    else drawChoropleth(group, layer, ctx)
  },
}
