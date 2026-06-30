// `base` primitive: land / borders. Area (or mesh-line) features rendered as plain
// SVG paths. No value mapping.

import type { PrimitiveRenderer } from '../types'

export const baseRenderer: PrimitiveRenderer = {
  drawSVG(group, layer, ctx) {
    const path = ctx.projector.path
    if (!path) return
    const s = layer.style
    group
      .selectAll<SVGPathElement, GeoJSON.Feature>('path')
      .data(layer.features.features)
      .join('path')
      .attr('d', (f) => path(f) ?? '')
      .attr('fill', s.fill ?? 'none')
      .attr('stroke', s.stroke ?? '#3a3f47')
      .attr('stroke-width', s.strokeWidth ?? 0.5)
      .attr('opacity', s.opacity ?? 1)
  },
}
