// Elevation + bathymetry builder (M5): real ETOPO1 global relief (NOAA NGDC, public domain) via
// NOAA CoastWatch ERDDAP, contoured at build time into hypsometric bands. ETOPO covers both land
// elevation and ocean bathymetry in one grid, so a single diverging sea/land ramp reads as a
// complete relief-and-bathymetry map.
//
// This builder is deliberately thin: it fetches the full-sphere altitude grid and hands it to the
// shared `scalarGridToBands` factory, which owns the projection-invariant geometry (contouring,
// grid->geo, antimeridian/pole stitching, ring hygiene). Any future scalar surface (SST, climate)
// is the same two lines against a different variable.

import type { FeatureCollection } from 'geojson'
import { fetchErddapScalarGrid } from './adapters/erddapGrid'
import { scalarGridToBands } from './adapters/contourBands'
import { HYPSOMETRIC_LEVELS } from '../../../src/app/catalog'

const ERDDAP = 'https://coastwatch.pfeg.noaa.gov/erddap'

// ETOPO1 native resolution is 1/60 degrees; stride 60 samples it to ~1 degree - the crisp country
// borders layer on top, so a thematic 1 degree relief pattern reads well and stays within budget.
const STRIDE = 60

export async function buildElevation(): Promise<FeatureCollection> {
  const grid = await fetchErddapScalarGrid({
    base: ERDDAP,
    datasetId: 'etopo180',
    variable: 'altitude',
    lat: [-90, 90],
    lon: [-180, 180], // full sphere; bands are antimeridian-cut at +-180 (no dropped strip, no stitch)
    stride: STRIDE,
  })
  const { features, bandCount, floor } = scalarGridToBands(grid, HYPSOMETRIC_LEVELS)
  console.log(`  elevation: ${bandCount} hypsometric bands (ETOPO1, ~${(STRIDE / 60).toFixed(2)}deg, floor ${floor} m, full -180..180)`)
  return features
}
