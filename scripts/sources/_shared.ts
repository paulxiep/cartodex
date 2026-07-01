// Shared producer helpers: network fetch with retry, a quote-aware CSV parser, and the
// ISO-3166 alpha-3 -> numeric crosswalk that joins source rows to the world-atlas
// geometry ids. Each source builder (worldbank, openflights, ...) imports from here and
// returns a normalized snapshot; scripts/build-data.ts orchestrates and writes.

const ISO_URL =
  'https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.json'

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// A real User-Agent matters: several source CDNs (notably api.worldbank.org) reject a
// fraction of header-less Node fetch requests with a 400/403 as suspected bot traffic.
const HEADERS = {
  'User-Agent': 'cartodex-databuild/0.0 (+https://github.com/paulxiep/cartodex)',
  Accept: 'application/json, text/csv, */*',
}

export async function getText(url: string, attempts = 3): Promise<string> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) })
      if (!r.ok) {
        // Include a snippet of the body: for a real client error the API says why (bad
        // indicator/parameter); a spurious edge/throttle 400 carries a generic message.
        const body = await r.text().catch(() => '')
        const snip = body.replace(/\s+/g, ' ').trim().slice(0, 120)
        throw new Error(`status ${r.status}${snip ? `: ${snip}` : ''}`)
      }
      return await r.text()
    } catch (e) {
      lastErr = e
      // Short backoff only: persistent upstream 502s are handled by the caller's retry
      // rounds, so there is no point burning 15s of sleep here per failing request.
      if (i < attempts - 1) await sleep(400 * (i + 1))
    }
  }
  throw new Error(`${(lastErr as Error).message} for ${url} (after ${attempts} attempts)`)
}

export async function getJson<T>(url: string): Promise<T> {
  return JSON.parse(await getText(url)) as T
}

/** Quote-aware CSV line parser (OpenFlights quotes text fields, uses \N for null). */
export function parseCsvLine(line: string): string[] {
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

export const nullable = (s: string | undefined): string => (s == null || s === '\\N' ? '' : s)

/** ISO-3166 alpha-3 -> numeric (as string, e.g. "GBR" -> "826"), for joins to geometry. */
export async function loadA3ToNum(): Promise<Map<string, string>> {
  const iso = await getJson<Array<Record<string, string>>>(ISO_URL)
  const a3ToNum = new Map<string, string>()
  for (const c of iso) {
    const a3 = c['alpha-3']
    const num = c['country-code']
    if (a3 && num) a3ToNum.set(a3, num)
  }
  return a3ToNum
}
