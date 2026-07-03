// `region` primitive: per-region area features, optionally coloured and/or area-scaled.
//   choropleth binding -> fill each region by its value through the layer's colour scale.
//   area binding       -> scale each region in place around its centroid by a second
//                         value (a non-contiguous cartogram), on an equal-area base.
// Both compose on ONE path set, so a colored cartogram is just both bindings present. The
// primitive is ignorant of "cartogram mode": it only sees optional `values`+`scale` (fill)
// and optional `area` (transform); the app decides which bindings are present.

import type { Feature } from 'geojson'
import type { GeoPath } from 'd3-geo'
import type { PrimitiveRenderer, ResolvedLayer, RenderContext, SvgGroup } from '../types'
import { makeColorScale, valueOf } from '../lib/scales'
import { showTooltip, hideTooltip } from '../lib/tooltip'

const NO_DATA = '#222831'

function readValue(layer: ResolvedLayer, f: Feature): number | undefined {
  const v = valueOf(layer, f)
  if (v != null) return v
  if (layer.area && f.id != null) return layer.area.values.get(f.id)
  return undefined
}

function label(feature: Feature, value: number | undefined): string {
  const name = (feature.properties?.['name'] as string | undefined) ?? String(feature.id ?? '')
  return value == null ? name : `${name}: ${value.toLocaleString()}`
}

// Fill colour per feature. With no colour binding (area-only cartogram) every region is a
// neutral no-data fill; otherwise the layer's colour scale maps its value.
function fillFn(layer: ResolvedLayer): (f: Feature) => string {
  if (!layer.values || !layer.scale) return () => NO_DATA
  const color = makeColorScale(layer.values.values(), layer.scale)
  return (f) => {
    const v = valueOf(layer, f)
    return v == null ? NO_DATA : (color(v) ?? NO_DATA)
  }
}

// Cartogram transform per feature: scale in place around the (screen-space) centroid by
// sqrt(value / max), so encoded area is proportional to value. Returns null (no transform)
// for regions without an area value or an undefined centroid.
function areaTransform(
  layer: ResolvedLayer,
  path: GeoPath,
): ((f: Feature) => string | null) | null {
  const area = layer.area
  if (!area) return null
  const max = area.domain[1]
  if (!(max > 0)) return null
  return (f) => {
    const v = f.id == null ? undefined : area.values.get(f.id)
    if (v == null) return null
    const k = Math.sqrt(Math.max(v, 0) / max)
    const [cx, cy] = path.centroid(f)
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
    return `translate(${cx},${cy}) scale(${k}) translate(${-cx},${-cy})`
  }
}

export const regionRenderer: PrimitiveRenderer = {
  drawSVG(group: SvgGroup, layer: ResolvedLayer, ctx: RenderContext) {
    const path = ctx.projector.path
    if (!path) return
    const fill = fillFn(layer)
    const transform = areaTransform(layer, path)
    const sel = group
      .selectAll<SVGPathElement, Feature>('path')
      .data(layer.features.features)
      .join('path')
      .attr('d', (f) => path(f) ?? '')
      .attr('fill', fill)
      .attr('stroke', layer.style.stroke ?? 'rgba(0,0,0,0.3)')
      .attr('stroke-width', layer.style.strokeWidth ?? 0.4)
      .on('pointermove', (e: PointerEvent, f) => showTooltip(label(f, readValue(layer, f)), e.clientX, e.clientY))
      .on('pointerleave', hideTooltip)
    if (transform) sel.attr('transform', (f) => transform(f))
  },
}
