// M5 WP-0 fixture producer: a SYNTHETIC scalar surface to prove the `surface` encoding (band
// fill + threshold/diverging colour + projection/clip across views) before the real ETOPO
// pipeline lands in WP-1. This is NOT real elevation - it is a deterministic engineering
// fixture, catalogued as `surface-fixture` and clearly labelled synthetic, and WP-1 removes it.
//
// The field sweeps the full elevation range across latitude (deepest at the south, snow at the
// north) with a gentle longitude ripple, sampled onto a grid of bounded cells (each a small
// rectangle, so d3-geo winding stays unambiguous - unlike a full-longitude band). The sweep
// crosses sea level, so every colour band - both sides of the diverging sea/land seam - shows
// as a legible stripe. The real WP-1 surface will instead be nested MultiPolygon contour bands.

import type { Feature, FeatureCollection, Polygon } from 'geojson'

// Deterministic synthetic elevation (metres) at a lon/lat: a south→north gradient spanning deep
// ocean (-8000) to high summit (+5000), crossing sea level around 21N, plus a longitude ripple
// so the coastline weaves rather than sitting on one parallel.
function elevation(lat: number, lon: number): number {
  const gradient = -8000 + ((lat + 90) / 180) * 13000
  const ripple = 900 * Math.sin((lon * Math.PI) / 180 * 2)
  return gradient + ripple
}

export function buildSurfaceFixture(): FeatureCollection {
  const step = 20 // degrees per cell (18 × 9 = 162 cells)
  const features: Feature<Polygon>[] = []
  for (let lon = -180; lon < 180; lon += step) {
    for (let lat = -90; lat < 90; lat += step) {
      const value = Math.round(elevation(lat + step / 2, lon + step / 2))
      features.push({
        type: 'Feature',
        properties: { value },
        geometry: {
          // Clockwise ring: d3-geo's spherical fill treats the interior as the region to the
          // right of the ring, so a CCW ring would fill the whole sphere minus the cell.
          type: 'Polygon',
          coordinates: [[[lon, lat], [lon, lat + step], [lon + step, lat + step], [lon + step, lat], [lon, lat]]],
        },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}
