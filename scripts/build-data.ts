// Producer: assemble id-keyed dataset snapshots into public/data/ from open sources.
// Run: `pnpm build-data`.
//
//   population.json : World Bank SP.POP.TOTL (latest per country), joined to the ISO
//                     numeric ids world-atlas uses via the ISO-3166 crosswalk.
//   airports.json   : OpenFlights airports (id/name/lon/lat + route-degree as value).
//   flights.json    : OpenFlights routes, aggregated by airport pair (value = count,
//                     the number of airlines flying the pair). All pairs are baked;
//                     density is a render-time minCount, not a build-time cap.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Incremental by default: skip a dataset whose snapshot already exists. Pass --force
// (via `pnpm refresh-data`) to re-fetch. So a normal build does not hit the network,
// but a fresh checkout / CI still produces the data once.
const FORCE = process.argv.includes('--force')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public', 'data')

const ISO_URL =
  'https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.json'
const WB_URL =
  'https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=400&mrnev=1'
const OF_AIRPORTS = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat'
const OF_ROUTES = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat'

interface RawPoint { id: string; name: string; lon: number; lat: number; value?: number }
interface RawFlow { from: string; to: string; value?: number }

function write(name: string, data: unknown): void {
  writeFileSync(resolve(OUT, name), JSON.stringify(data))
  console.log(`  wrote ${name} (${JSON.stringify(data).length} bytes)`)
}

async function getText(url: string, attempts = 3): Promise<string> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60000) })
      if (!r.ok) throw new Error(`status ${r.status}`)
      return await r.text()
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(`${(lastErr as Error).message} for ${url} (after ${attempts} attempts)`)
}
async function getJson<T>(url: string): Promise<T> {
  return JSON.parse(await getText(url)) as T
}

/** Quote-aware CSV line parser (OpenFlights quotes text fields, uses \N for null). */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQ = false
      } else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}
const nullable = (s: string | undefined): string => (s == null || s === '\\N' ? '' : s)

// ── Population: World Bank × ISO-3166 crosswalk (alpha-3 → ISO numeric) ──────────
async function buildPopulation(): Promise<Record<string, number>> {
  const iso = await getJson<Array<Record<string, string>>>(ISO_URL)
  const a3ToNum = new Map<string, string>()
  for (const c of iso) {
    const a3 = c['alpha-3']
    const num = c['country-code']
    if (a3 && num) a3ToNum.set(a3, num)
  }
  const wb = await getJson<[unknown, Array<{ countryiso3code?: string; value?: number | null }>]>(WB_URL)
  const rows = wb[1] ?? []
  const table: Record<string, number> = {}
  let matched = 0
  for (const row of rows) {
    const num = row.countryiso3code ? a3ToNum.get(row.countryiso3code) : undefined
    if (num && typeof row.value === 'number' && row.value > 0) {
      table[num] = row.value
      matched++
    }
  }
  if (matched < 100) throw new Error(`population join too small (${matched})`)
  console.log(`  population: ${matched} countries (World Bank × ISO-3166)`)
  return table
}

// ── Airports + flight routes: OpenFlights ───────────────────────────────────────
interface AirportRec { name: string; lon: number; lat: number }

async function buildAirportsAndFlights(): Promise<{ airports: RawPoint[]; flights: RawFlow[] }> {
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

  // Bake ALL unique routes with their airline-count as `value`. Density is tuned at
  // render time via a configurable minCount (see app layers), not capped here.
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

const present = (...names: string[]): boolean => names.every((n) => existsSync(resolve(OUT, n)))

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  console.log(`Building datasets → ${OUT}${FORCE ? ' (--force)' : ''}`)

  // Each dataset is independent: if a source is down, skip it and keep the existing
  // snapshot rather than failing the whole build.
  if (!FORCE && present('population.json')) {
    console.log('  population: present, skipping (pnpm refresh-data to refresh)')
  } else {
    try {
      write('population.json', await buildPopulation())
    } catch (e) {
      console.warn(`  population skipped, kept existing: ${(e as Error).message}`)
    }
  }

  if (!FORCE && present('airports.json', 'flights.json')) {
    console.log('  airports/flights: present, skipping (pnpm refresh-data to refresh)')
  } else {
    try {
      const { airports, flights } = await buildAirportsAndFlights()
      write('airports.json', airports)
      write('flights.json', flights)
    } catch (e) {
      console.warn(`  airports/flights skipped, kept existing: ${(e as Error).message}`)
    }
  }
  console.log('Done.')
}

void main()
