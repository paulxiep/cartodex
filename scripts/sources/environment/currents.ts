// Currents builder: real Aviso geostrophic surface currents (NOAA ERDDAP, 0.25°) averaged over
// a set of months into a mean (u,v) field, then integrated into streamlines - the same central
// pipeline as winds. Geostrophic currents are undefined at the equator and poleward of ~75°, so
// those cells stay masked (empty) rather than faked.
//
// Source ladder: the primary is the reachable NOAA ERDDAP Aviso dataset. If it fails, currents
// are deferred (winds still ship) - never fabricated. NASA OSCAR (PO.DAAC) is the nominal source
// but was unreachable from the build host; the Aviso ERDDAP grid is the real substitute.

import type { FeatureCollection } from 'geojson'
import { fetchErddapVectorGrid } from './adapters/erddapGrid'
import { integrateStreamlines } from './streamlines'

const ERDDAP = 'https://coastwatch.pfeg.noaa.gov/erddap'

export async function buildCurrents(): Promise<FeatureCollection> {
  const grid = await fetchErddapVectorGrid({
    base: ERDDAP,
    datasetId: 'erdTAgeomday_LonPM180',
    uVar: 'u_current',
    vVar: 'v_current',
    lat: [-74.875, 74.875],
    lon: [-179.875, 179.875],
    stride: 8, // 0.25° native → ~2° sampling
    z: 0, // single altitude level (surface)
    times: ['2008-01-16', '2008-04-16', '2008-07-16', '2008-10-16'],
  })
  const lines = integrateStreamlines(grid, { sepDeg: 4, stepDeg: 1.1, maxSteps: 16, minSpeed: 0.03, maxLines: 550 })
  console.log(`  currents: ${lines.length} streamlines (Aviso geostrophic currents, mean field)`)
  return { type: 'FeatureCollection', features: lines }
}
