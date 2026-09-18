// Self-hosted multi-resolution base geometry, built from ONE Natural Earth 1:10m source (public domain,
// license-clean). Emits world-{10m,50m,110m}.json by simplifying one weighted topology at three
// thresholds, so every tier shares the same arcs, a coarser tier keeps a subset of a finer tier's
// vertices, and borders stay aligned across a zoom swap. This replaces the world-atlas CDN dependency
// with same-origin tiers. Static: seeded once (make seed-static), not on the cron.
//
// The output matches the world-atlas topology the engine's geodata loaders read: a `countries` object
// whose geometry ids are ISO 3166-1 numeric as zero-padded 3-digit STRINGS (regions join to values by
// this exact key), one id per country. As world-atlas does, the Natural Earth antimeridian and polar
// cuts are stitched first, so stroked country outlines carry no seam along 180 degrees on globe and
// polar views. Quantized on one shared grid.

import { geoArea } from 'd3-geo'
import { geoStitch } from 'd3-geo-projection'
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson'
import type { Arc, GeometryCollection, GeometryObject, Objects, Topology } from 'topojson-specification'
import { topology } from 'topojson-server'
import { presimplify, quantile, sphericalRingArea, sphericalTriangleArea } from 'topojson-simplify'
import { quantize } from 'topojson-client'
import { getJson } from '../_shared'

// One Natural Earth 1:10m source for all three tiers (nvkelso mirror, the same host as the rivers set).
const NE_10M_COUNTRIES =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson'

// Shared coordinate-quantization grid (matches world-atlas 50m): ~0.0036 deg (~400 m) at global extent.
// One grid for all tiers so their arcs align.
const QUANT = 1e5

// Fraction of interior vertices each tier keeps (topojson-simplify's quantile sorts weights descending,
// so p is the kept fraction). Tuned by output size; the 10m tier is fetched only on deep zoom.
const TIERS: ReadonlyArray<{ file: string; keep: number }> = [
  { file: 'world-10m.json', keep: 0.5 },
  { file: 'world-50m.json', keep: 0.12 },
  { file: 'world-110m.json', keep: 0.04 },
]

interface NeProps {
  NAME?: string
  ADM0_A3?: string
  ISO_A3_EH?: string
  ISO_N3?: string
  ISO_N3_EH?: string
}

const isCode = (code: string | undefined): code is string => !!code && code !== '-99'

// ISO 3166-1 numeric id as world-atlas keys it: a zero-padded 3-digit STRING; regions join to values by
// this exact key with no coercion (scales.ts valueOf). ISO_N3 when set. Natural Earth leaves ISO_N3 at
// "-99" for France and Norway and files their code under ISO_N3_EH, but _EH also repeats the parent's
// code on separate territories (Clipperton I., Baikonur, Brazilian I., Indian Ocean Ter., Coral Sea
// Is.), so _EH counts only for the unit the code names (ADM0_A3 equal to ISO_A3_EH). A feature with
// neither (Kosovo) gets no id and renders as no-data, as in world-atlas.
function isoId(p: NeProps): string | undefined {
  const raw = isCode(p.ISO_N3)
    ? p.ISO_N3
    : isCode(p.ISO_N3_EH) && p.ADM0_A3 != null && p.ADM0_A3 === p.ISO_A3_EH
      ? p.ISO_N3_EH
      : undefined
  return raw?.padStart(3, '0')
}

// Area on the sphere regardless of ring winding: every country is smaller than a hemisphere.
function sphereSize(area: number): number {
  return Math.min(area, 4 * Math.PI - area)
}

// One id per country. A territory that still carries its parent's code (Ashmore and Cartier Is. has
// ISO_N3 "036") would repeat the parent's value and draw a second bubble, so the id stays on the
// largest feature and is cleared on the rest.
function dedupeIds(features: Feature[]): void {
  const byId = new Map<string | number, Feature[]>()
  for (const f of features) {
    if (f.id == null) continue
    const group = byId.get(f.id)
    if (group) group.push(f)
    else byId.set(f.id, [f])
  }
  for (const [id, group] of byId) {
    if (group.length < 2) continue
    group.sort((a, b) => sphereSize(geoArea(b)) - sphereSize(geoArea(a)))
    for (const f of group.slice(1)) {
      console.log(`  basemap: id ${id} kept on ${group[0]!.properties?.['name']}, cleared on ${f.properties?.['name']}`)
      f.id = undefined
    }
  }
}

// Natural Earth 10m cuts Russia (Chukotka, Wrangel Island) and Fiji at the antimeridian with the two
// sides' cut vertices up to ~0.0014 degrees apart, and starts many of those rings on the cut. geoStitch
// joins cut fragments only by exactly matching end points and mishandles a ring that starts on the
// cut, which left edges along 180 degrees that stroked outlines draw as borders. So before stitching,
// each ring is rotated to start off the cut, and each cut vertex is snapped to its nearest counterpart
// across the cut.
const ON_CUT = 1e-4 // degrees; geoStitch's own antimeridian/pole epsilon
const SNAP = 0.005 // degrees; a few times the widest cross-cut mismatch in the source

const onMeridian = (p: Position): boolean => Math.abs(Math.abs(p[0]!) - 180) <= ON_CUT
const onCut = (p: Position): boolean => onMeridian(p) || Math.abs(p[1]!) >= 90 - ON_CUT

// A copy of a closed ring that starts at its first vertex off the cut.
function startOffCut(ring: Position[]): Position[] {
  const open = ring.slice(0, -1).map((p) => [p[0]!, p[1]!])
  const start = open.findIndex((p) => !onCut(p))
  const rotated = start > 0 ? [...open.slice(start), ...open.slice(0, start)] : open
  return [...rotated, [rotated[0]![0]!, rotated[0]![1]!]]
}

function prepareCuts(geometry: Polygon | MultiPolygon): Polygon | MultiPolygon {
  const polygons = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).map((rings) =>
    rings.map(startOffCut),
  )
  const west: Position[] = []
  const east: Position[] = []
  for (const rings of polygons) for (const ring of rings) for (const p of ring) if (onMeridian(p)) (p[0]! < 0 ? west : east).push(p)
  // Closest cross-cut pairs first; each vertex joins at most one pair.
  const pairs: Array<[Position, Position, number]> = []
  for (const w of west) {
    for (const e of east) {
      const gap = Math.abs(w[1]! - e[1]!)
      if (gap <= SNAP) pairs.push([w, e, gap])
    }
  }
  pairs.sort((a, b) => a[2] - b[2])
  const paired = new Set<Position>()
  for (const [w, e] of pairs) {
    if (paired.has(w) || paired.has(e)) continue
    paired.add(w)
    paired.add(e)
    w[1] = e[1] = (w[1]! + e[1]!) / 2
  }
  return geometry.type === 'Polygon' ? { type: 'Polygon', coordinates: polygons[0]! } : { type: 'MultiPolygon', coordinates: polygons }
}

export interface BaseTier {
  file: string
  topo: Topology
  countries: number
}

export async function buildBasemap(): Promise<BaseTier[]> {
  const fc = await getJson<FeatureCollection<Polygon | MultiPolygon, NeProps>>(NE_10M_COUNTRIES, 120000)
  // Strip to id + name only: Natural Earth ships ~160 properties per feature, which would bloat the
  // tiers by an order of magnitude. The region tooltip reads properties.name (lowercase).
  const features: Feature[] = fc.features.map((f) => ({
    type: 'Feature',
    id: isoId(f.properties ?? {}),
    properties: { name: f.properties?.NAME ?? '' },
    geometry: prepareCuts(f.geometry),
  }))
  dedupeIds(features)
  const keyed = features.filter((f) => f.id != null).length
  console.log(`  basemap: ${features.length} countries from Natural Earth 10m (${keyed} ISO-keyed, public domain)`)

  // Stitch the cuts, then weight one non-quantized topology by SPHERICAL triangle area. Planar area in
  // lon/lat gives a vertex on a straight run along a parallel zero weight, so a parallel border (49N)
  // would collapse to one great-circle edge that bows off the true line. @types skew: topojson-server
  // types topology() loosely; topojson-simplify wants Topology<Objects>.
  const stitched = geoStitch<FeatureCollection>({ type: 'FeatureCollection', features })
  const pre = presimplify(topology({ countries: stitched }) as unknown as Topology<Objects>, sphericalTriangleArea)

  return TIERS.map(({ file, keep }) => {
    const topo = quantize(simplifyTier(pre, quantile(pre, keep)), QUANT)
    return { file, topo, countries: (topo.objects['countries'] as GeometryCollection).geometries.length }
  })
}

type Ring = number[] // arc indexes; ~i is arc i reversed

const polygonsOf = (g: GeometryObject): Ring[][] =>
  g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : []

const sameVertex = (a: Position, b: Position): boolean => a[0] === b[0] && a[1] === b[1]

// One tier from the weighted topology: each arc keeps its vertices at or above the tier weight (arc ends
// weigh Infinity, so every arc keeps both ends). Rings left with fewer than 3 distinct vertices draw
// nothing, so they are dropped. A country whose every ring collapses (Singapore, Malta, Tuvalu at the
// coarse tiers) instead keeps its largest ring as a small polygon built from that ring's highest-weight
// vertices, so it still has a fill, a hover target and a centroid. Arcs no ring uses are pruned.
function simplifyTier(pre: Topology<Objects>, minWeight: number): Topology<Objects> {
  const forced = new Map<number, Set<number>>() // arc index -> vertex indexes kept below the tier weight
  const restored = new Set<Ring>()

  const kept = (arc: number, i: number, p: Position): boolean => p[2]! >= minWeight || !!forced.get(arc)?.has(i)
  const all = (): boolean => true

  const ringPoints = (ring: Ring, keep: (arc: number, i: number, p: Position) => boolean): Position[] => {
    const points: Position[] = []
    for (const signed of ring) {
      const arc = signed < 0 ? ~signed : signed
      const part = pre.arcs[arc]!.filter((p, i) => keep(arc, i, p))
      if (signed < 0) part.reverse()
      points.push(...(points.length ? part.slice(1) : part))
    }
    return points
  }
  // Fewer than 3 distinct kept vertices; stops at the third, so a normal ring is cheap to test.
  const collapsed = (ring: Ring): boolean => {
    const distinct: Position[] = []
    for (const signed of ring) {
      const arc = signed < 0 ? ~signed : signed
      const points = pre.arcs[arc]!
      for (let i = 0; i < points.length; i++) {
        const p = points[i]!
        if (!kept(arc, i, p) || distinct.some((q) => sameVertex(p, q))) continue
        distinct.push(p)
        if (distinct.length === 3) return false
      }
    }
    return true
  }
  const ringArea = (points: Position[]): number => sphericalRingArea(points as Array<[number, number]>, false)

  // Rebuild a collapsed ring from its highest-weight interior vertices until it has 3 distinct vertices
  // and winds the same way as the full ring (a reversed sliver would fill the rest of the globe).
  const restore = (ring: Ring): void => {
    restored.add(ring)
    const clockwise = ringArea(ringPoints(ring, all)) < 2 * Math.PI
    const candidates: Array<{ arc: number; i: number; weight: number }> = []
    for (const signed of ring) {
      const arc = signed < 0 ? ~signed : signed
      pre.arcs[arc]!.forEach((p, i) => {
        if (p[2]! < minWeight) candidates.push({ arc, i, weight: p[2]! })
      })
    }
    candidates.sort((a, b) => b.weight - a.weight)
    for (const { arc, i } of candidates) {
      const vertices = forced.get(arc) ?? new Set<number>()
      vertices.add(i)
      forced.set(arc, vertices)
      if (collapsed(ring)) continue
      const area = ringArea(ringPoints(ring, kept))
      if (area > 0 && (area < 2 * Math.PI) === clockwise) return
    }
  }

  const countries = pre.objects['countries'] as GeometryCollection
  // Restore first: forcing vertices only ever reopens rings, it never collapses one.
  for (const g of countries.geometries) {
    const exteriors = polygonsOf(g).map((rings) => rings[0]!)
    if (exteriors.length === 0 || exteriors.some((ring) => !collapsed(ring))) continue
    const sizes = exteriors.map((ring) => sphereSize(ringArea(ringPoints(ring, all))))
    restore(exteriors[sizes.indexOf(Math.max(...sizes))]!)
  }

  const arcs: Arc[] = []
  const renumbered = new Map<number, number>()
  const arcIndex = (signed: number): number => {
    const arc = signed < 0 ? ~signed : signed
    let index = renumbered.get(arc)
    if (index == null) {
      index = arcs.length
      renumbered.set(arc, index)
      arcs.push(pre.arcs[arc]!.filter((p, i) => kept(arc, i, p)).map((p) => [p[0]!, p[1]!]))
    }
    return signed < 0 ? ~index : index
  }
  // A polygon survives when its exterior does (or was restored); collapsed holes are dropped.
  const keepPolygon = (rings: Ring[]): Ring[] | null => {
    const [exterior, ...holes] = rings
    if (!exterior || (collapsed(exterior) && !restored.has(exterior))) return null
    return [exterior, ...holes.filter((hole) => !collapsed(hole))].map((ring) => ring.map(arcIndex))
  }
  const keepPolygons = (polygons: Ring[][]): Ring[][] =>
    polygons.map(keepPolygon).filter((rings): rings is Ring[] => rings != null)

  const geometries = countries.geometries.map((g): GeometryObject => {
    if (g.type === 'Polygon') return { ...g, arcs: keepPolygons([g.arcs])[0] ?? [] }
    if (g.type === 'MultiPolygon') return { ...g, arcs: keepPolygons(g.arcs) }
    return g
  })

  return { type: 'Topology', bbox: pre.bbox, objects: { countries: { type: 'GeometryCollection', geometries } }, arcs }
}
