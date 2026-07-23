// Currents builder: real Aviso geostrophic surface currents (NOAA ERDDAP, 0.25°), built per calendar
// month as a climatology - the mean of that month across a set of years - then integrated into
// streamlines, the same central pipeline as winds. Geostrophic currents are undefined at the equator
// and poleward of ~75°, so those cells stay masked (empty) rather than faked. Month-resolved so the
// composer's month control can show seasonal shifts in the major currents.
//
// Source ladder: the primary is the reachable NOAA ERDDAP Aviso dataset. If it fails, currents
// are deferred (winds still ship) - never fabricated. NASA OSCAR (PO.DAAC) is the nominal source
// but was unreachable from the build host; the Aviso ERDDAP grid is the real substitute.

import type { FeatureCollection } from 'geojson'
import { fetchErddapVectorGrid } from './adapters/erddapGrid'
import { integrateStreamlines } from './streamlines'

const ERDDAP = 'https://coastwatch.pfeg.noaa.gov/erddap'
// Years averaged per month into the climatology. This Aviso ERDDAP dataset runs through ~2008, so
// these five years are all present; a missing year/month is skipped by the fetch. Verify-at-build knob.
const YEARS = [2004, 2005, 2006, 2007, 2008]

const mm = (m: number): string => String(m).padStart(2, '0')

export async function buildCurrents(month: number): Promise<FeatureCollection> {
  const grid = await fetchErddapVectorGrid({
    base: ERDDAP,
    datasetId: 'erdTAgeomday_LonPM180',
    uVar: 'u_current',
    vVar: 'v_current',
    lat: [-74.875, 74.875],
    lon: [-179.875, 179.875],
    stride: 8, // 0.25° native → ~2° sampling
    z: 0, // single altitude level (surface)
    times: YEARS.map((y) => `${y}-${mm(month)}-16`),
  })
  const lines = integrateStreamlines(grid, { sepDeg: 4, stepDeg: 1.1, maxSteps: 16, minSpeed: 0.03, maxLines: 550 })
  console.log(`  currents ${mm(month)}: ${lines.length} streamlines (Aviso geostrophic currents, monthly climatology)`)
  return { type: 'FeatureCollection', features: lines }
}
