// Seaports adapter: a FULL OUTER JOIN of two real sources on port identity -
//   - NGA World Port Index (WPI): the comprehensive port register (~2,950 ports, public
//     domain), used for port existence + location. This is the universe: every WPI port is
//     shown even when no traffic figure exists (it renders empty, never faked).
//   - IMF PortWatch: real AIS-derived vessel traffic (total + per-type counts). This supplies
//     the marker weight where a port matches.
//
// Join key is the UN/LOCODE (normalized), with a nearest-coordinate fallback so a port present
// in both under mismatched/absent codes is not double-listed. Ports only in PortWatch are added
// with their traffic; ports only in WPI are kept empty. `value` is the REAL total vessel count;
// `cargo` the real cargo-type sum - both unset when unknown (no proxy, no zero-fill).

import { getJson } from '../_shared'

const WPI_URL = 'https://msi.nga.mil/api/publications/world-port-index?output=json'
const PW_FS =
  'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/PortWatch_ports_database/FeatureServer/0/query'
const PW_FIELDS = [
  'portid', 'portname', 'fullname', 'lat', 'lon', 'LOCODE',
  'vessel_count_total', 'vessel_count_container', 'vessel_count_dry_bulk',
  'vessel_count_general_cargo', 'vessel_count_tanker',
].join(',')

// Two ports within this distance (deg, ~9 km) with no LOCODE match are treated as the same port.
const SNAP_DEG = 0.08

export interface RawPoint {
  id: string
  name: string
  lon: number
  lat: number
  value?: number
  /** real per-type vessel counts (for per-type weightings). `cargo` = the cargo-type sum. */
  cargo?: number
  container?: number
  tanker?: number
  dryBulk?: number
}

const q4 = (n: number): number => Number(n.toFixed(4))
const num = (n: unknown): number | undefined =>
  typeof n === 'number' && Number.isFinite(n) ? n : undefined
const norm = (s: string | null | undefined): string => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// ── WPI registry (the port universe) ──────────────────────────────────────────
interface WpiPort {
  portNumber: number
  portName: string
  countryName: string | null
  unloCode: string | null
  xcoord: number
  ycoord: number
}
interface WpiResponse { ports: WpiPort[] }

interface RegistryPort { id: string; name: string; lon: number; lat: number; locode: string }

async function fetchWpiRegistry(): Promise<RegistryPort[]> {
  const { ports } = await getJson<WpiResponse>(WPI_URL)
  const out: RegistryPort[] = []
  for (const p of ports) {
    const lon = num(p.xcoord)
    const lat = num(p.ycoord)
    if (lon == null || lat == null) continue
    const locode = norm(p.unloCode)
    out.push({
      id: locode || `WPI${p.portNumber}`,
      name: p.countryName ? `${p.portName}, ${p.countryName}` : p.portName,
      lon: q4(lon),
      lat: q4(lat),
      locode,
    })
  }
  return out
}

// ── PortWatch traffic ─────────────────────────────────────────────────────────
interface PwAttrs {
  portid: number
  portname: string
  fullname: string | null
  lat: number
  lon: number
  LOCODE: string | null
  vessel_count_total: number | null
  vessel_count_container: number | null
  vessel_count_dry_bulk: number | null
  vessel_count_general_cargo: number | null
  vessel_count_tanker: number | null
}
interface PwResponse { features: { attributes: PwAttrs }[]; exceededTransferLimit?: boolean }

interface TrafficPort {
  locode: string
  name: string
  lon: number
  lat: number
  value?: number
  cargo?: number
  container?: number
  tanker?: number
  dryBulk?: number
  generalCargo?: number
}

function cargoOf(a: PwAttrs): number | undefined {
  const parts = [a.vessel_count_container, a.vessel_count_dry_bulk, a.vessel_count_general_cargo, a.vessel_count_tanker]
  const known = parts.filter((p): p is number => typeof p === 'number' && Number.isFinite(p))
  return known.length ? known.reduce((s, p) => s + p, 0) : undefined
}

async function fetchPortWatchTraffic(): Promise<TrafficPort[]> {
  const out: TrafficPort[] = []
  const PAGE = 2000
  // Advance the offset by rows actually returned - the server caps a page at its own limit.
  for (let offset = 0; ; ) {
    const url =
      `${PW_FS}?where=1%3D1&outFields=${encodeURIComponent(PW_FIELDS)}` +
      `&returnGeometry=false&f=json&resultOffset=${offset}&resultRecordCount=${PAGE}`
    const res = await getJson<PwResponse>(url)
    if (res.features.length === 0) break
    offset += res.features.length
    for (const { attributes: a } of res.features) {
      const lon = num(a.lon)
      const lat = num(a.lat)
      if (lon == null || lat == null) continue
      out.push({
        locode: norm(a.LOCODE),
        name: a.fullname || a.portname,
        lon: q4(lon),
        lat: q4(lat),
        value: num(a.vessel_count_total),
        cargo: cargoOf(a),
        container: num(a.vessel_count_container),
        tanker: num(a.vessel_count_tanker),
        dryBulk: num(a.vessel_count_dry_bulk),
      })
    }
    if (!res.exceededTransferLimit) break
  }
  return out
}

/** Nearest registry port within SNAP_DEG of (lon,lat), or null. */
function nearestWithin(reg: RawPoint[], lon: number, lat: number): RawPoint | null {
  let best: RawPoint | null = null
  let bestD = SNAP_DEG * SNAP_DEG
  for (const r of reg) {
    const d = (r.lon - lon) ** 2 + (r.lat - lat) ** 2
    if (d < bestD) {
      bestD = d
      best = r
    }
  }
  return best
}

export async function buildPorts(): Promise<RawPoint[]> {
  const [registry, traffic] = await Promise.all([fetchWpiRegistry(), fetchPortWatchTraffic()])

  // Start from the WPI universe (traffic unset); index by LOCODE for the primary join.
  const out: RawPoint[] = registry.map((r) => ({ id: r.id, name: r.name, lon: r.lon, lat: r.lat }))
  const byLocode = new Map<string, RawPoint>()
  registry.forEach((r, i) => {
    if (r.locode) byLocode.set(r.locode, out[i]!)
  })

  const bundle = (t: TrafficPort): Partial<RawPoint> => ({
    value: t.value, cargo: t.cargo, container: t.container, tanker: t.tanker, dryBulk: t.dryBulk,
  })
  let joined = 0
  let added = 0
  for (const t of traffic) {
    const match = (t.locode && byLocode.get(t.locode)) || nearestWithin(out, t.lon, t.lat)
    if (match) {
      // Attach the real traffic bundle; if two ports map here, keep the busier record's figures.
      if (t.value != null && (match.value == null || t.value > match.value)) Object.assign(match, bundle(t))
      joined++
    } else {
      out.push({ id: t.locode || `PW${added}`, name: t.name, lon: t.lon, lat: t.lat, ...bundle(t) })
      added++
    }
  }

  const withVolume = out.filter((p) => p.value != null).length
  console.log(
    `  ports: ${out.length} (WPI ${registry.length} ∪ PortWatch ${traffic.length}; ${joined} joined, ${added} PortWatch-only, ${withVolume} with AIS traffic)`,
  )
  return out
}
