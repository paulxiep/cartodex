// The three pure-projection d3-svg views: equirectangular (flat reference),
// azimuthal-equidistant (the polar map), and orthographic (a 2.5D globe in SVG).
// Each fits the world to the container and exposes a Projector via svgProjector.

import { geoEquirectangular, geoAzimuthalEquidistant, geoOrthographic } from 'd3-geo'
import type { GeoGeometryObjects } from 'd3-geo'
import type { View } from '../types'
import { svgProjector, SPHERE } from './_svgProjector'

const sphere = SPHERE as unknown as GeoGeometryObjects

export const equirectangular: View = {
  id: 'equirectangular',
  label: 'Equirectangular',
  kind: 'projection',
  build(width, height) {
    const projection = geoEquirectangular().fitSize([width, height], sphere)
    return svgProjector(projection)
  },
}

export const azimuthalEquidistant: View = {
  id: 'azimuthal-equidistant',
  label: 'Azimuthal Equidistant (Polar)',
  kind: 'projection',
  rotatable: true,
  showCenter: true,
  build(width, height) {
    // Center on the North Pole and show the whole sphere (clipAngle ~180°).
    const projection = geoAzimuthalEquidistant()
      .rotate([0, -90])
      .clipAngle(180 - 1e-3)
      .fitSize([width, height], sphere)
    return svgProjector(projection)
  },
}

export const orthographic: View = {
  id: 'orthographic',
  label: 'Orthographic Globe',
  kind: 'projection',
  rotatable: true,
  build(width, height) {
    // clipAngle(90) hides the back hemisphere; project() returns null there.
    const projection = geoOrthographic()
      .rotate([0, -20])
      .clipAngle(90)
      .fitSize([width, height], sphere)
    return svgProjector(projection)
  },
}
