// `field` primitive: a gridded vector field (winds, ocean surface currents) drawn as static
// streamlines. Each feature is a LineString traced along the flow, carrying a `magnitude`
// (in the layer's value table, keyed by feature id). Stroke-width encodes magnitude via sqrt
// so a fast jet reads heavier than a slow drift; the dataset's identity colour (style.stroke)
// distinguishes winds from currents when both are bound to the channel.
//
// Unlike `flow`, streamlines are NOT merged into one path: width and opacity vary per feature,
// so each is its own <path>. geoPath projects and clips each line (back-hemisphere segments on
// a globe drop out for free). Density is a build-time concern - the producer caps the streamline
// count to the weight budget - so the renderer just draws what it is given.

import type { Feature, LineString } from 'geojson'
import type { PrimitiveRenderer, ResolvedLayer, RenderContext, SvgGroup } from '../types'
import { radiusScale, valueOf } from '../lib/scales'

interface DrawnLine {
  d: string
  w: number
}

const WIDTH_RANGE: [number, number] = [0.3, 2.2]
// Arrowhead marker size, in units of the line's stroke width (markerUnits=strokeWidth).
const ARROW_SIZE = 5

export const fieldRenderer: PrimitiveRenderer = {
  drawSVG(group: SvgGroup, layer: ResolvedLayer, ctx: RenderContext) {
    const path = ctx.projector.path
    if (!path) return
    const color = layer.style.stroke ?? layer.style.arcColor ?? 'rgba(120,200,255,0.6)'
    const domain = layer.valueDomain ?? [0, 1]
    const width = radiusScale(domain, layer.style.widthRange ?? WIDTH_RANGE)

    const lines: DrawnLine[] = []
    for (const f of layer.features.features) {
      if (f.geometry?.type !== 'LineString') continue
      const d = path(f.geometry as LineString)
      if (!d) continue // fully clipped (e.g. back of the globe)
      const v = valueOf(layer, f as Feature)
      lines.push({ d, w: v == null ? 0.5 : width(v) })
    }

    // A downstream arrowhead marker gives streamlines a flow direction (lines are built
    // upstream→downstream, so the path end is downstream). markerUnits=strokeWidth scales the
    // arrow with the line, so faster flow reads heavier and directional.
    let markerRef: string | null = null
    if (layer.style.arrowhead) {
      const id = `arrow-${layer.id}`
      const defs = group.append('defs')
      defs
        .append('marker')
        .attr('id', id)
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 8).attr('refY', 5)
        .attr('markerWidth', ARROW_SIZE).attr('markerHeight', ARROW_SIZE)
        .attr('markerUnits', 'strokeWidth')
        .attr('orient', 'auto-start-reverse')
        .append('path')
        .attr('d', 'M0,1 L9,5 L0,9 Z')
        .attr('fill', color)
      markerRef = `url(#${id})`
    }

    // A casing pass: a wider stroke of a contrasting colour drawn beneath the core, so the line
    // reads over any background (plate boundaries over dark sea, bright relief, or warm SST). Drawn
    // first so the core sits on top.
    const casing = layer.style.casing
    if (casing) {
      group
        .selectAll<SVGPathElement, DrawnLine>('path.field-casing')
        .data(lines)
        .join('path')
        .attr('class', 'field-casing')
        .attr('d', (l) => l.d)
        .attr('fill', 'none')
        .attr('stroke', casing.color)
        .attr('stroke-width', (l) => l.w + casing.width)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('opacity', layer.style.opacity ?? 0.75)
    }

    const sel = group
      .selectAll<SVGPathElement, DrawnLine>('path.field-line')
      .data(lines)
      .join('path')
      .attr('class', 'field-line')
      .attr('d', (l) => l.d)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', (l) => l.w)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .attr('opacity', layer.style.opacity ?? 0.75)
    if (markerRef) sel.attr('marker-end', markerRef)
  },
  // The widest core plus its casing; an arrowhead reaches ARROW_SIZE stroke widths past the line end.
  cullPadding: (layer) => {
    const widest = (layer.style.widthRange ?? WIDTH_RANGE)[1] + (layer.style.casing?.width ?? 0)
    return layer.style.arrowhead ? widest * ARROW_SIZE : widest
  },
}
