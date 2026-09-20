// d3-geo-projection ships no type declarations and has no @types package. The producer uses only
// geoStitch (base tiers), which returns a copy of the object with antimeridian and polar cuts removed.
declare module 'd3-geo-projection' {
  import type { GeoJsonObject } from 'geojson'

  export function geoStitch<T extends GeoJsonObject>(object: T): T
}
