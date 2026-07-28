// Central presentation palette: the colours, marker shapes, and line treatments the binding
// resolver (layers.ts) applies. Kept out of catalog.ts (which stays display-agnostic data) and out
// of the engine (which holds no dataset knowledge), so all marker/line styling lives in one place
// and is tuned here rather than scattered through the resolvers.

import type { MarkerShape } from '../engine'
import type { Dataset } from './catalog'

// ── Shared tones ────────────────────────────────────────────────────────────────────────────
// Air (airports/flights) stays yellow, sea (seaports/lanes) one blue tone, so the two systems never
// blur together and sea sub-layers merge cleanly.
export const AIR_YELLOW = '#ffcc44'
export const SEA_BLUE = 'rgba(96,168,235,0.85)'
// Submarine cables take a contrasting signal-amber so they read against the sea-blue water networks.
export const CABLE_AMBER = 'rgba(240,175,90,0.85)'
// Vector-field identity tones: currents cool teal, winds warm amber, so both read when overlaid.
export const CURRENTS_COLOR = 'rgba(90,200,190,0.75)'
export const WINDS_COLOR = 'rgba(240,150,90,0.8)'

// A white halo makes a marker read on any background (dark sea, a bright choropleth, relief/SST).
const OUTLINE = '#ffffff'
const OUTLINE_W = 1

// ── Markers ─────────────────────────────────────────────────────────────────────────────────
export interface MarkerStyle {
  fill: string
  shape: MarkerShape
  stroke: string
  strokeWidth: number
}

// Per-dataset marker style, keyed by dataset id. Distinct shape AND colour so overlaid point layers
// (airports, seaports, volcanoes, earthquakes, cities) never read as one undifferentiated dot field.
const MARKER_STYLES: Record<string, Omit<MarkerStyle, 'stroke' | 'strokeWidth'>> = {
  airports: { fill: AIR_YELLOW, shape: 'circle' },
  volcanoes: { fill: '#e23b2e', shape: 'triangle' }, // point-up red triangle
  'quakes-recent': { fill: '#8a5a2b', shape: 'square' }, // brown square
  'quakes-historic': { fill: '#5e3a1a', shape: 'square' }, // darker brown square
  cities: { fill: '#6b7280', shape: 'diamond' }, // mid-grey diamond (diagonal square); dark enough that the white outline reads
}

/** Marker style for a point dataset: explicit per-id style, else a domain fallback (maritime → blue
 *  circle, everything else → yellow circle). Every marker carries the white outline halo. */
export function markerStyleFor(ds: Dataset): MarkerStyle {
  const base = MARKER_STYLES[ds.id] ?? { fill: ds.domain === 'maritime' ? SEA_BLUE : AIR_YELLOW, shape: 'circle' as const }
  return { ...base, stroke: OUTLINE, strokeWidth: OUTLINE_W }
}

// ── Tectonic plate boundaries ─────────────────────────────────────────────────────────────────
// A bright warm core over a dark casing, so the line separates from cool (bathymetry) and warm (SST)
// backgrounds alike. Fixed width (unweighted network); higher opacity than the faint lane default.
export const PLATE_STYLE = {
  core: '#ffcf3a',
  casing: { color: '#101418', width: 2 },
  width: 1.2,
  opacity: 0.95,
}
