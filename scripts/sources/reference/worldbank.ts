// World Bank WDI source builder. One generic fetch per indicator code, joined to ISO
// numeric geometry ids via the alpha-3 crosswalk. The indicator catalog lives in
// src/app/catalog.ts (shared with the app); this module just turns a code into a
// { numericISO: value } table.
//
// We request `mrv=N` (most recent N years) and pick the latest non-null value per country
// ourselves. NOT `mrnev` ("most recent non-empty"): that forces the WB server to scan all
// history per country, which it errors on under load (a spurious HTTP 400). `mrv` is a
// cheap fixed-window slice, and picking the newest non-null client-side gives the same
// result while tolerating a null latest year.

import { getJson } from '../_shared'

const WB_BASE = 'https://api.worldbank.org/v2/country/all/indicator'
// Years of history to consider; large enough to cover indicators reported every few years.
const MRV = 10

interface WbRow {
  countryiso3code?: string
  value?: number | null
  date?: string
}

/**
 * Fetch one World Bank indicator and return a numeric-ISO-keyed value table (latest
 * non-null value per country). Returns an empty object (with a warning) rather than
 * throwing when a code yields no matches, so a single dead/renamed code never fails the
 * whole build.
 */
export async function buildWorldBankIndicator(
  code: string,
  a3ToNum: Map<string, string>,
): Promise<Record<string, number>> {
  const url = `${WB_BASE}/${code}?format=json&per_page=20000&mrv=${MRV}`
  const wb = await getJson<[unknown, WbRow[] | null]>(url)
  const rows = wb[1] ?? []
  // Keep the most recent non-null value per country (rows span up to MRV years each).
  const best = new Map<string, { year: number; value: number }>()
  for (const row of rows) {
    const num = row.countryiso3code ? a3ToNum.get(row.countryiso3code) : undefined
    if (!num || typeof row.value !== 'number' || !Number.isFinite(row.value)) continue
    const year = Number(row.date)
    if (!Number.isFinite(year)) continue // a NaN year would wrongly pin as "best" forever
    const cur = best.get(num)
    if (!cur || year > cur.year) best.set(num, { year, value: row.value })
  }
  const table: Record<string, number> = {}
  for (const [num, b] of best) table[num] = b.value
  const matched = best.size
  if (matched === 0) console.warn(`    ${code}: 0 matches (skipped)`)
  else console.log(`    ${code}: ${matched} countries`)
  return table
}
