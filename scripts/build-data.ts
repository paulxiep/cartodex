// Producer: assemble id-keyed dataset snapshots into public/data/ from open sources.
// Run: `pnpm build-data` (incremental) or `pnpm refresh-data` (--force refetch).
//
//   wdi-<id>.json : World Bank WDI indicators (latest per country), joined to the ISO
//                   numeric ids world-atlas uses. The catalog is src/app/indicators.ts.
//   airports.json : OpenFlights airports (id/name/lon/lat + route-degree as value).
//   flights.json  : OpenFlights routes, aggregated by airport pair (value = airline
//                   count). All pairs baked; density is a render-time minCount.
//
// Each dataset is independent: a source that is down is skipped, keeping the existing
// snapshot rather than failing the whole build. Snapshots are a gitignored build artifact.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { WDI_INDICATORS } from '../src/app/indicators'
import { loadA3ToNum, sleep } from './sources/_shared'
import { buildWorldBankIndicator } from './sources/worldbank'
import { buildAirportsAndFlights } from './sources/openflights'

// Incremental by default: skip a dataset whose snapshot already exists. Pass --force
// (via `pnpm refresh-data`) to re-fetch. A fresh checkout / CI still produces data once.
const FORCE = process.argv.includes('--force')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public', 'data')

function write(name: string, data: unknown): void {
  writeFileSync(resolve(OUT, name), JSON.stringify(data))
  console.log(`  wrote ${name} (${JSON.stringify(data).length} bytes)`)
}

const present = (...names: string[]): boolean => names.every((n) => existsSync(resolve(OUT, n)))

async function buildWdi(): Promise<void> {
  const pending = WDI_INDICATORS.filter((ind) => FORCE || !present(`wdi-${ind.id}.json`))
  if (pending.length === 0) {
    console.log(`  WDI: all ${WDI_INDICATORS.length} present, skipping (pnpm refresh-data to refresh)`)
    return
  }
  let a3ToNum: Map<string, string>
  try {
    a3ToNum = await loadA3ToNum()
  } catch (e) {
    console.warn(`  WDI skipped (ISO crosswalk unavailable): ${(e as Error).message}`)
    return
  }
  // The WB API returns sporadic 400s/timeouts under load, hitting a random subset each
  // pass. Retry only the ones that errored, in additional rounds, so a single run clears
  // almost all of them. An empty result (200 with no data) is a dead/renamed code, not a
  // transient failure, so it is not retried.
  const MAX_ROUNDS = 4
  let remaining = pending
  for (let round = 1; round <= MAX_ROUNDS && remaining.length > 0; round++) {
    console.log(`  WDI round ${round}: ${remaining.length} indicator(s) (World Bank × ISO-3166)`)
    const failed: typeof remaining = []
    for (const ind of remaining) {
      try {
        const table = await buildWorldBankIndicator(ind.code, a3ToNum)
        if (Object.keys(table).length > 0) write(`wdi-${ind.id}.json`, table)
        else console.warn(`  ${ind.id} skipped (no data for ${ind.code})`)
      } catch (e) {
        console.warn(`  ${ind.id}: ${(e as Error).message}, will retry`)
        failed.push(ind)
      }
    }
    remaining = failed
    if (remaining.length > 0 && round < MAX_ROUNDS) await sleep(1500) // brief cool off before retrying failures
  }
  if (remaining.length > 0) {
    console.warn(`  WDI: ${remaining.length} still failing after ${MAX_ROUNDS} rounds (kept existing): ${remaining.map((r) => r.id).join(', ')}`)
  }
}

async function buildFlights(): Promise<void> {
  if (!FORCE && present('airports.json', 'flights.json')) {
    console.log('  airports/flights: present, skipping (pnpm refresh-data to refresh)')
    return
  }
  try {
    const { airports, flights } = await buildAirportsAndFlights()
    // Guard against a degraded (non-throwing but tiny/partial) fetch overwriting good data.
    if (airports.length >= 500) write('airports.json', airports)
    else console.warn(`  airports: only ${airports.length}, kept existing`)
    if (flights.length >= 500) write('flights.json', flights)
    else console.warn(`  flights: only ${flights.length}, kept existing`)
  } catch (e) {
    console.warn(`  airports/flights skipped, kept existing: ${(e as Error).message}`)
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  console.log(`Building datasets → ${OUT}${FORCE ? ' (--force)' : ''}`)
  await buildWdi()
  await buildFlights()
  console.log('Done.')
}

void main()
