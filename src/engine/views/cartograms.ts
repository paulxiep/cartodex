// Cartogram views. A cartogram is a *view* (it owns area layout), not a layer: it is
// D∘P, a data-driven distortion over an equal-area base projection. The view supplies
// the equal-area base + a `cartogramKind`; the `region` primitive reads cartogramKind
// and lays areas out (it owns the values, so it owns the distortion). Equal-area base
// is why cartograms can't sit on the azimuthal/globe views.

import { geoEqualEarth } from 'd3-geo'
import type { GeoGeometryObjects } from 'd3-geo'
import type { View } from '../types'
import { svgProjector, SPHERE } from './_svgProjector'

const sphere = SPHERE as unknown as GeoGeometryObjects

export const cartogramNoncontiguous: View = {
  id: 'cartogram-noncontiguous',
  label: 'Cartogram - Non-contiguous',
  kind: 'cartogram',
  cartogramKind: 'noncontiguous',
  build(width, height) {
    const projection = geoEqualEarth().fitSize([width, height], sphere)
    return svgProjector(projection)
  },
}
