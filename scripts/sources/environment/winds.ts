// Winds builder: real FNMOC 10 m surface winds (NOAA ERDDAP, monthly) averaged over a set of
// months into a mean (u,v) field, then integrated into streamlines. The producer emits a
// FeatureCollection of LineStrings with a per-feature `magnitude` (mean wind speed, m/s), which
// the `field` channel draws with width by magnitude.

import type { FeatureCollection } from 'geojson'
import { fetchErddapVectorGrid } from './adapters/erddapGrid'
import { integrateStreamlines } from './streamlines'

const ERDDAP = 'https://coastwatch.pfeg.noaa.gov/erddap'

export async function buildWinds(): Promise<FeatureCollection> {
  const grid = await fetchErddapVectorGrid({
    base: ERDDAP,
    datasetId: 'erdlasFnWind10_LonPM180',
    uVar: 'u_mean',
    vVar: 'v_mean',
    lat: [-90, 90],
    lon: [-180, 179],
    stride: 2, // 1° native → ~2° sampling
    times: ['2021-01-16', '2021-04-16', '2021-07-16', '2021-10-16'],
  })
  const lines = integrateStreamlines(grid, { sepDeg: 4, stepDeg: 1.2, maxSteps: 16, minSpeed: 1.0, maxLines: 550 })
  console.log(`  winds: ${lines.length} streamlines (FNMOC 10 m winds, mean field)`)
  return { type: 'FeatureCollection', features: lines }
}
