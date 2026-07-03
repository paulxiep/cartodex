// Domain-neutral dataset catalog: the single source of truth for what data exists, its
// join kind, its licensing/attribution, and its default colour scale. A dataset is
// display-agnostic (no channel, no encoding baked in); the composer binds it into a channel
// with a scale. World Bank WDI is one *source adapter* (wdiDataset) that emits `region`
// datasets from a flat indicator table; airports/flights are point/pair datasets.
//
// This module is PURE data + types (no import.meta / DOM), so the Node producer
// (scripts/build-data.ts) imports the indicator rows directly. `source.snapshot` is a bare
// filename under public/data/; data-loaders.ts resolves it to a URL (that is the only part
// that knows where snapshots are hosted). Types imported from the engine are type-only and
// erased at runtime, so this stays Node-safe.

// Pure vocabulary only (no DOM/d3), so the Node producer can import this module.
import type { DatasetKind, ScaleType } from '../engine/model'

/** Thematic grouping for the composer. Open taxonomy: maritime/environment land in M3. */
export type DomainId =
  | 'demographics'
  | 'economy'
  | 'resources'
  | 'health'
  | 'transport'
  | 'maritime'
  | 'environment'

export const DOMAIN_ORDER: DomainId[] = [
  'demographics',
  'economy',
  'resources',
  'health',
  'transport',
  'maritime',
  'environment',
]

export const DOMAIN_LABELS: Record<DomainId, string> = {
  demographics: 'Demographics',
  economy: 'Economy',
  resources: 'Resources & environment',
  health: 'Health',
  transport: 'Transport',
  maritime: 'Maritime',
  environment: 'Environment',
}

export type DataSource =
  | { mode: 'baked'; snapshot: string } // re-hosted open snapshot; basename under public/data/
  | { mode: 'client'; url: string; join: { sourceKey: string; geomKey: string } }

export interface Dataset {
  id: string
  label: string
  kind: DatasetKind
  domain: DomainId
  source: DataSource
  /** ledger fields (rendered as in-app attribution and generated into docs/DATA_SOURCES.md). */
  provider: string
  license: string
  attribution: string
  /** default colour scale type when bound to a colour channel; size channels always use sqrt. */
  defaultScale?: ScaleType
  /** default colour ramp (d3-scale-chromatic key) for a colour channel. */
  defaultRamp?: string
  /** for `pair` datasets: the `point` dataset whose ids the endpoints reference. */
  endpointsFrom?: string
}

// ── World Bank WDI indicator table (shared with the producer) ─────────────────────────────
// `id` is the dataset id and the wdi-<id>.json snapshot basename; `code` is the WB v2 code;
// `ramp` is the default colour ramp; `scale` overrides the default (linear) where the data is
// magnitude-skewed (money/counts → log; distributions → quantile).
export interface WdiIndicator {
  id: string
  label: string
  code: string
  domain: DomainId
  ramp: string
  scale?: ScaleType
}

export const WDI_INDICATORS: WdiIndicator[] = [
  // ── Demographics ──────────────────────────────────────────────────────────────
  { id: 'population', label: 'Population', code: 'SP.POP.TOTL', domain: 'demographics', ramp: 'YlGnBu', scale: 'quantile' },
  { id: 'pop-density', label: 'Population density (per km²)', code: 'EN.POP.DNST', domain: 'demographics', ramp: 'YlGnBu', scale: 'quantile' },
  { id: 'pop-growth', label: 'Population growth (%/yr)', code: 'SP.POP.GROW', domain: 'demographics', ramp: 'PuBuGn' },
  { id: 'life-expectancy', label: 'Life expectancy (years)', code: 'SP.DYN.LE00.IN', domain: 'demographics', ramp: 'RdYlGn' },
  { id: 'fertility', label: 'Fertility rate (births/woman)', code: 'SP.DYN.TFRT.IN', domain: 'demographics', ramp: 'BuPu' },
  { id: 'urban-pct', label: 'Urban population (%)', code: 'SP.URB.TOTL.IN.ZS', domain: 'demographics', ramp: 'PuBu' },
  { id: 'infant-mortality', label: 'Infant mortality (per 1k births)', code: 'SP.DYN.IMRT.IN', domain: 'demographics', ramp: 'OrRd' },
  { id: 'net-migration', label: 'Net migration', code: 'SM.POP.NETM', domain: 'demographics', ramp: 'PiYG' },

  // ── Economy ───────────────────────────────────────────────────────────────────
  { id: 'gdp', label: 'GDP (current US$)', code: 'NY.GDP.MKTP.CD', domain: 'economy', ramp: 'YlGn', scale: 'log' },
  { id: 'gdp-per-capita', label: 'GDP per capita (US$)', code: 'NY.GDP.PCAP.CD', domain: 'economy', ramp: 'Greens', scale: 'log' },
  { id: 'gdp-per-capita-ppp', label: 'GDP per capita, PPP (int$)', code: 'NY.GDP.PCAP.PP.CD', domain: 'economy', ramp: 'Greens', scale: 'log' },
  { id: 'gdp-growth', label: 'GDP growth (%/yr)', code: 'NY.GDP.MKTP.KD.ZG', domain: 'economy', ramp: 'PuBuGn' },
  { id: 'gni-per-capita', label: 'GNI per capita (US$)', code: 'NY.GNP.PCAP.CD', domain: 'economy', ramp: 'Greens', scale: 'log' },
  { id: 'inflation', label: 'Inflation (%/yr)', code: 'FP.CPI.TOTL.ZG', domain: 'economy', ramp: 'OrRd' },
  { id: 'unemployment', label: 'Unemployment (%)', code: 'SL.UEM.TOTL.ZS', domain: 'economy', ramp: 'OrRd' },
  { id: 'gini', label: 'Gini index', code: 'SI.POV.GINI', domain: 'economy', ramp: 'YlOrRd' },
  { id: 'exports-pct-gdp', label: 'Exports (% of GDP)', code: 'NE.EXP.GNFS.ZS', domain: 'economy', ramp: 'BuGn' },

  // ── Resources / environment ─────────────────────────────────────────────────────
  { id: 'co2-per-capita', label: 'CO₂ per capita (t)', code: 'EN.GHG.CO2.PC.CE.AR5', domain: 'resources', ramp: 'OrRd' },
  { id: 'forest-pct', label: 'Forest area (%)', code: 'AG.LND.FRST.ZS', domain: 'resources', ramp: 'Greens' },
  { id: 'arable-pct', label: 'Arable land (%)', code: 'AG.LND.ARBL.ZS', domain: 'resources', ramp: 'YlGn' },
  { id: 'agri-land-pct', label: 'Agricultural land (%)', code: 'AG.LND.AGRI.ZS', domain: 'resources', ramp: 'YlGn' },
  { id: 'renewable-energy-pct', label: 'Renewable energy (% of final)', code: 'EG.FEC.RNEW.ZS', domain: 'resources', ramp: 'Greens' },
  { id: 'electricity-access-pct', label: 'Electricity access (%)', code: 'EG.ELC.ACCS.ZS', domain: 'resources', ramp: 'YlOrBr' },
  { id: 'energy-use', label: 'Energy use per capita (kg oil eq)', code: 'EG.USE.PCAP.KG.OE', domain: 'resources', ramp: 'OrRd', scale: 'log' },
  { id: 'freshwater-per-capita', label: 'Renewable freshwater per capita (m³)', code: 'ER.H2O.INTR.PC', domain: 'resources', ramp: 'PuBu', scale: 'log' },
  { id: 'land-area', label: 'Land area (km²)', code: 'AG.LND.TOTL.K2', domain: 'resources', ramp: 'BuGn', scale: 'quantile' },

  // ── Health ──────────────────────────────────────────────────────────────────────
  { id: 'health-spend-pct-gdp', label: 'Health spending (% of GDP)', code: 'SH.XPD.CHEX.GD.ZS', domain: 'health', ramp: 'RdPu' },
  { id: 'physicians', label: 'Physicians (per 1k)', code: 'SH.MED.PHYS.ZS', domain: 'health', ramp: 'RdYlGn' },
  { id: 'hospital-beds', label: 'Hospital beds (per 1k)', code: 'SH.MED.BEDS.ZS', domain: 'health', ramp: 'RdYlGn' },
]

function wdiDataset(ind: WdiIndicator): Dataset {
  return {
    id: ind.id,
    label: ind.label,
    kind: 'region',
    domain: ind.domain,
    source: { mode: 'baked', snapshot: `wdi-${ind.id}.json` },
    provider: 'World Bank WDI',
    license: 'CC-BY 4.0',
    attribution: `${ind.label}: World Bank (${ind.code}, CC-BY 4.0) · ISO-3166 crosswalk`,
    defaultScale: ind.scale ?? 'linear',
    defaultRamp: ind.ramp,
  }
}

export const DATASETS: Record<string, Dataset> = {
  ...Object.fromEntries(WDI_INDICATORS.map((ind) => [ind.id, wdiDataset(ind)])),
  airports: {
    id: 'airports',
    label: 'Airports',
    kind: 'point',
    domain: 'transport',
    source: { mode: 'baked', snapshot: 'airports.json' },
    provider: 'OpenFlights',
    license: 'Open Database License',
    attribution: 'Airports: OpenFlights (ODbL)',
  },
  flights: {
    id: 'flights',
    label: 'Flight routes',
    kind: 'pair',
    domain: 'transport',
    source: { mode: 'baked', snapshot: 'flights.json' },
    provider: 'OpenFlights',
    license: 'Open Database License',
    attribution: 'Flight routes: OpenFlights (ODbL) — top routes by frequency',
    endpointsFrom: 'airports',
  },
  // Not wired: sea ports, shipping routes, winds, currents (M3 — maritime/environment domains).
}

export const DATASET_LIST: Dataset[] = Object.values(DATASETS)

/** Datasets of a given kind, in catalog order (for populating a channel's dataset options). */
export function datasetsOfKind(kind: DatasetKind): Dataset[] {
  return DATASET_LIST.filter((d) => d.kind === kind)
}
