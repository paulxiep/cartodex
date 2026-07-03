// OpenFlights source builder: airports (id/name/lon/lat + route-degree as value) and
// flight routes aggregated by airport pair (value = number of airlines flying the pair).
// All unique pairs are baked; render-time minCount tunes density (see src/app/layers.ts).

import { getText, parseCsvLine, nullable } from '../_shared'

const OF_AIRPORTS = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat'
const OF_ROUTES = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat'

interface RawPoint { id: string; name: string; lon: number; lat: number; value?: number }
interface RawFlow { from: string; to: string; value?: number }
interface AirportRec { name: string; lon: number; lat: number }

export async function buildAirportsAndFlights(): Promise<{ airports: RawPoint[]; flights: RawFlow[] }> {
  const airportsText = await getText(OF_AIRPORTS)
  const byIata = new Map<string, AirportRec>()
  for (const line of airportsText.split('\n')) {
    if (!line.trim()) continue
    const f = parseCsvLine(line)
    const iata = nullable(f[4])
    const lat = Number(f[6])
    const lon = Number(f[7])
    if (iata.length !== 3 || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
    byIata.set(iata, { name: nullable(f[1]) || iata, lon, lat })
  }

  const routesText = await getText(OF_ROUTES)
  const pairCount = new Map<string, number>()
  for (const line of routesText.split('\n')) {
    if (!line.trim()) continue
    const f = line.split(',')
    const src = f[2]
    const dst = f[4]
    if (!src || !dst || src === dst) continue
    if (!byIata.has(src) || !byIata.has(dst)) continue
    const key = src < dst ? `${src}|${dst}` : `${dst}|${src}`
    pairCount.set(key, (pairCount.get(key) ?? 0) + 1)
  }

  const flights: RawFlow[] = [...pairCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => {
      const [from, to] = key.split('|') as [string, string]
      return { from, to, value }
    })

  const degree = new Map<string, number>()
  for (const fl of flights) {
    degree.set(fl.from, (degree.get(fl.from) ?? 0) + (fl.value ?? 1))
    degree.set(fl.to, (degree.get(fl.to) ?? 0) + (fl.value ?? 1))
  }
  const airports: RawPoint[] = [...degree.keys()].map((iata) => {
    const a = byIata.get(iata)!
    return { id: iata, name: a.name, lon: a.lon, lat: a.lat, value: degree.get(iata)! }
  })

  console.log(`  airports: ${airports.length} (OpenFlights, all route endpoints)`)
  console.log(`  flights: ${flights.length} routes (OpenFlights, all unique pairs)`)
  return { airports, flights }
}
