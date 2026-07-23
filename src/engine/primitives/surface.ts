// `surface` primitive: a baked scalar field (elevation/bathymetry relief, heatmaps) rendered
// as filled contour bands. Each feature is a polygon band carrying a single `value` (its band
// level) in the layer value table; the band is filled by that value through the shared colour
// scale - a choropleth over contour bands instead of countries. The producer runs marching
// squares at build time, so the renderer just projects and fills what it is given; geoPath
// clips each band for free (back-hemisphere on a globe, antimeridian seam).
//
// A surface is a single-occupancy background: it fills the whole map, so it is drawn behind the
// other layers (the app orders it backmost). No value → transparent, so gaps stay see-through.

import type { Feature } from 'geojson'
import type { PrimitiveRenderer, ResolvedLayer, RenderContext, SvgGroup } from '../types'
import { makeColorScale, valueOf } from '../lib/scales'
import { showTooltip, hideTooltip } from '../lib/tooltip'

const NO_DATA = 'transparent'

function fillFn(layer: ResolvedLayer): (f: Feature) => string {
  if (!layer.values || !layer.scale) return () => NO_DATA
  const color = makeColorScale(layer.values.values(), layer.scale)
  return (f) => {
    const v = valueOf(layer, f)
    return v == null ? NO_DATA : (color(v) ?? NO_DATA)
  }
}

export const surfaceRenderer: PrimitiveRenderer = {
  drawSVG(group: SvgGroup, layer: ResolvedLayer, ctx: RenderContext) {
    const path = ctx.projector.path
    if (!path) return
    const fill = fillFn(layer)
    group
      .selectAll<SVGPathElement, Feature>('path')
      .data(layer.features.features)
      .join('path')
      .attr('d', (f) => path(f) ?? '')
      .attr('fill', fill)
      .attr('stroke', 'none')
      .attr('opacity', layer.style.opacity ?? 1)
      .on('pointermove', (e: PointerEvent, f) => {
        const v = valueOf(layer, f)
        if (v != null) showTooltip(v.toLocaleString(), e.clientX, e.clientY)
      })
      .on('pointerleave', hideTooltip)
  },
}
