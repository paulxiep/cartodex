// `flow` primitive: a weighted edge between two geo-nodes. One primitive covers flight
// routes and country relations (trade, alliances, conflict); they differ only in data.
// Features are (great-circle-densified) LineStrings.
//
// All arcs are merged into a SINGLE <path> (one MultiLineString): geoPath projects and
// clips the whole set in one pass, so tens of thousands of routes render and repaint
// cheaply (and back-hemisphere arcs are clipped on globe views for free). Density is
// controlled by style.minValue, dropping arcs whose value is below the threshold.

import type { LineString, MultiLineString, Position } from 'geojson'
import type { PrimitiveRenderer, ResolvedLayer, RenderContext, SvgGroup } from '../types'
import { valueOf } from '../lib/scales'

export const flowRenderer: PrimitiveRenderer = {
  drawSVG(group: SvgGroup, layer: ResolvedLayer, ctx: RenderContext) {
    const path = ctx.projector.path
    if (!path) return
    const color = layer.style.arcColor ?? layer.style.stroke ?? 'rgba(120,200,255,0.55)'
    const minValue = layer.style.minValue

    const coordinates: Position[][] = []
    for (const f of layer.features.features) {
      if (f.geometry?.type !== 'LineString') continue
      if (minValue != null) {
        const v = valueOf(layer, f)
        if (v != null && v < minValue) continue
      }
      coordinates.push((f.geometry as LineString).coordinates)
    }

    const multi: MultiLineString = { type: 'MultiLineString', coordinates }
    group
      .append('path')
      .attr('d', path(multi) ?? '')
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', layer.style.strokeWidth ?? 0.5)
      .attr('stroke-linecap', 'round')
      .attr('opacity', layer.style.opacity ?? 0.5)
  },
}
