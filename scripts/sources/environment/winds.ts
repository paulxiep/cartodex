// Winds builder: real FNMOC 10 m surface winds (NOAA ERDDAP, monthly), built per calendar month as
// a climatology - the mean of that month across a set of recent years - then integrated into
// streamlines. The producer emits a FeatureCollection of LineStrings with a per-feature `magnitude`
// (mean wind speed, m/s), which the `field` channel draws with width by magnitude. Month-resolved so
// the composer's month control can show the seasonal circulation (monsoon reversal, roaring forties).

import type { FeatureCollection } from 'geojson'
import { fetchErddapVectorGrid } from './adapters/erddapGrid'
import { integrateStreamlines } from './streamlines'

const ERDDAP = 'https://coastwatch.pfeg.noaa.gov/erddap'
// Recent years averaged per month into the climatology; a missing year/month is skipped (the fetch
// tolerates it) so the mean is over the months that returned. Verify-at-build knob.
const YEARS = [2018, 2019, 2020, 2021, 2022]

const mm = (m: number): string => String(m).padStart(2, '0')

export async function buildWinds(month: number): Promise<FeatureCollection> {
  const grid = await fetchErddapVectorGrid({
    base: ERDDAP,
    datasetId: 'erdlasFnWind10_LonPM180',
    uVar: 'u_mean',
    vVar: 'v_mean',
    lat: [-90, 90],
    lon: [-180, 179],
    stride: 2, // 1° native → ~2° sampling
    times: YEARS.map((y) => `${y}-${mm(month)}-16`),
  })
  const lines = integrateStreamlines(grid, { sepDeg: 4, stepDeg: 1.2, maxSteps: 16, minSpeed: 1.0, maxLines: 550 })
  console.log(`  winds ${mm(month)}: ${lines.length} streamlines (FNMOC 10 m winds, monthly climatology)`)
  return { type: 'FeatureCollection', features: lines }
}
