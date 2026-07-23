// NOAA NCEI volcano source builder: distinct volcanoes with a significant eruption in the
// public-domain NCEI Significant Volcanic Eruptions database, as points on the `marker` channel.
// The database is keyed by eruption EVENT, so many rows repeat a volcano; we keep one point per
// volcano (identified by name + country), sized by summit elevation. Real locations and
// elevations as reported: no proxy, no zero-fill (a volcano with no elevation renders unsized).

import { getJson } from '../_shared'

const NCEI = 'https://www.ngdc.noaa.gov/hazel/hazard-service/api/v1/volcanoes'

interface NceiVolcano {
  id: number
  name: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  elevation: number | null
}
interface NceiPage { items: NceiVolcano[]; totalPages: number }

export interface RawPoint { id: string; name: string; lon: number; lat: number; value?: number }

const q3 = (n: number): number => Number(n.toFixed(3))
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

// The NCEI hazard API caps a page at 200 items, so paginate through totalPages.
const PER_PAGE = 200

export async function buildVolcanoes(): Promise<RawPoint[]> {
  const first = await getJson<NceiPage>(`${NCEI}?itemsPerPage=${PER_PAGE}&page=1`)
  const rows: NceiVolcano[] = [...first.items]
  for (let p = 2; p <= first.totalPages; p++) {
    const page = await getJson<NceiPage>(`${NCEI}?itemsPerPage=${PER_PAGE}&page=${p}`)
    rows.push(...page.items)
  }

  // Collapse eruption rows to distinct volcanoes; fill elevation from a later row if the first lacked it.
  const byKey = new Map<string, RawPoint>()
  for (const v of rows) {
    const name = v.name?.trim()
    if (!name || !finite(v.longitude) || !finite(v.latitude)) continue
    const key = `${name.toUpperCase()}|${(v.country ?? '').toUpperCase()}`
    const elev = finite(v.elevation) ? v.elevation : undefined
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, {
        id: `NCEI${v.id}`,
        name: v.country ? `${name}, ${v.country}` : name,
        lon: q3(v.longitude),
        lat: q3(v.latitude),
        ...(elev != null ? { value: elev } : {}),
      })
    } else if (existing.value == null && elev != null) {
      existing.value = elev
    }
  }

  const out = [...byKey.values()]
  console.log(`  volcanoes: ${out.length} distinct (NOAA NCEI significant eruptions, public domain)`)
  return out
}
