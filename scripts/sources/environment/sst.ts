// Sea-surface temperature builder (M5b): real NOAA OISST v2.1 SST, contoured at build time into
// the same value-carrying bands as elevation - the second `surface` dataset, proving the scalar-grid
// encoding generalises beyond relief. Ocean only: land and ice-masked cells are NaN in the source
// and stay masked (transparent) in the bands, never faked to zero.
//
// Month-resolved: buildSST(m) returns the SST field for calendar month m as a monthly CLIMATOLOGY -
// the mean of that month across a set of recent complete years (a real average of real monthly
// fields, the winds/currents discipline applied to a scalar). SST_LEVELS are fixed across all 12
// months, so a January map and a July map share one colour scale and read as directly comparable.
//
// The OISST monthly grid is served on a 0..360 longitude axis, so the fetched grid is remapped to
// -180..180 before contouring (the band factory expects the full sphere with the antimeridian seam).

import type { FeatureCollection } from 'geojson'
import { fetchErddapScalarGrid, scalarGridTo180 } from './adapters/erddapGrid'
import { scalarGridToBands } from './adapters/contourBands'
import { SST_LEVELS } from '../../../src/app/catalog'

// NOAA OISST v2.1 monthly (0.25°, 1981-present) on the NEFSC ERDDAP. Variable `sst`, no depth axis,
// 0..360 longitude, monthly timestamps at month-start. Verify-at-build knobs: dataset id / variable
// / available years.
const ERDDAP = 'https://comet.nefsc.noaa.gov/erddap'
const DATASET = 'noaa_psl_2d74_d418_a6fb'
const VARIABLE = 'sst'
const STRIDE = 4 // 0.25° native → ~1° sampling; the crisp country borders layer on top
// Recent complete years averaged per month into the climatology. A missing year/month is skipped
// (fetchErddapScalarGrid tolerates it), so the mean is over the months that actually returned.
const YEARS = [2018, 2019, 2020, 2021, 2022]

const mm = (m: number): string => String(m).padStart(2, '0')

export async function buildSST(month: number): Promise<FeatureCollection> {
  const raw = await fetchErddapScalarGrid({
    base: ERDDAP,
    datasetId: DATASET,
    variable: VARIABLE,
    lat: [-89.875, 89.875],
    lon: [0.125, 359.875], // full 0..360; remapped to -180..180 below
    stride: STRIDE,
    times: YEARS.map((y) => `${y}-${mm(month)}-01`),
  })
  const grid = scalarGridTo180(raw)
  const { features, bandCount, floor } = scalarGridToBands(grid, SST_LEVELS)
  console.log(`  sst ${mm(month)}: ${bandCount} bands (OISST monthly climatology, ${YEARS.length}-yr mean, floor ${floor}°C)`)
  return features
}
