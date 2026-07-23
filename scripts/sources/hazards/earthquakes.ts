// USGS earthquake source builder: two point datasets for the `marker` channel, from the
// public-domain USGS FDSN event service. `recent` is the strongest quakes in a rolling window
// (a live "where the ground is moving now" map, refreshed by the scheduled producer); `historic`
// is the great quakes of the instrumental record (a stable map of the big ones that trace the
// plate boundaries). Real events only: magnitude, place and depth exactly as USGS reports them.

import type { FeatureCollection, Point } from 'geojson'
import { getJson } from '../_shared'

const FDSN = 'https://earthquake.usgs.gov/fdsnws/event/1/query'

interface UsgsProps { mag: number | null; place: string | null }
type UsgsFC = FeatureCollection<Point, UsgsProps>

export interface RawPoint { id: string; name: string; lon: number; lat: number; value?: number; depth?: number }

const q3 = (n: number): number => Number(n.toFixed(3))

function shape(fc: UsgsFC): RawPoint[] {
  const out: RawPoint[] = []
  for (const f of fc.features) {
    const c = f.geometry?.coordinates
    const mag = f.properties?.mag
    if (!c || typeof mag !== 'number' || !Number.isFinite(mag)) continue
    const [lon, lat, depth] = c
    if (typeof lon !== 'number' || typeof lat !== 'number') continue
    out.push({
      id: String(f.id),
      name: f.properties?.place || `M ${mag}`,
      lon: q3(lon),
      lat: q3(lat),
      value: mag,
      ...(typeof depth === 'number' && Number.isFinite(depth) ? { depth: q3(depth) } : {}),
    })
  }
  return out
}

/** One FDSN query, always ordered by magnitude so `limit` keeps the top-N strongest events. */
async function query(params: Record<string, string>): Promise<RawPoint[]> {
  const qs = new URLSearchParams({ format: 'geojson', orderby: 'magnitude', ...params }).toString()
  return shape(await getJson<UsgsFC>(`${FDSN}?${qs}`))
}

const isoDay = (d: Date): string => d.toISOString().slice(0, 10)

/** Strongest quakes in a rolling 24-month window: the live significant-seismicity map. This is
 *  the DYNAMIC set (the scheduled Worker producer refreshes the window); build separately so the
 *  Worker can refresh it without refetching the static historic catalog. */
export async function buildRecentEarthquakes(): Promise<RawPoint[]> {
  const start = new Date()
  start.setFullYear(start.getFullYear() - 2)
  const recent = await query({ starttime: isoDay(start), minmagnitude: '4.5', limit: '2000' })
  console.log(`  earthquakes(recent): ${recent.length} (M>=4.5, 24 mo) — USGS FDSN`)
  return recent
}

/** The great quakes of the instrumental record (M >= 7 since 1900): a stable belt map. Static. */
export async function buildHistoricEarthquakes(): Promise<RawPoint[]> {
  const historic = await query({ starttime: '1900-01-01', minmagnitude: '7', limit: '2000' })
  console.log(`  earthquakes(historic): ${historic.length} (M>=7, since 1900) — USGS FDSN`)
  return historic
}

export async function buildEarthquakes(): Promise<{ recent: RawPoint[]; historic: RawPoint[] }> {
  const [recent, historic] = await Promise.all([buildRecentEarthquakes(), buildHistoricEarthquakes()])
  return { recent, historic }
}
