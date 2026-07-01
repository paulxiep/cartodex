// Declarative World Bank WDI indicator registry: the single source of truth shared by
// the producer (scripts/sources/worldbank.ts) and the app dataset/layer registries.
// Adding a World Bank choropleth is one row here - no new builder or layer code.
//
// This module is pure data (no import.meta / no DOM) so the Node build script can import
// it directly. `id` is both the dataset id and the public/data/wdi-<id>.json basename;
// `code` is the World Bank v2 indicator code; `ramp` is a d3-scale-chromatic key.

export type Theme = 'demographics' | 'economy' | 'resources' | 'health'

export interface WdiIndicator {
  id: string
  label: string
  code: string
  theme: Theme
  ramp: string
}

export const WDI_INDICATORS: WdiIndicator[] = [
  // ── Demographics ──────────────────────────────────────────────────────────────
  { id: 'population', label: 'Population', code: 'SP.POP.TOTL', theme: 'demographics', ramp: 'YlGnBu' },
  { id: 'pop-density', label: 'Population density (per km²)', code: 'EN.POP.DNST', theme: 'demographics', ramp: 'YlGnBu' },
  { id: 'pop-growth', label: 'Population growth (%/yr)', code: 'SP.POP.GROW', theme: 'demographics', ramp: 'PuBuGn' },
  { id: 'life-expectancy', label: 'Life expectancy (years)', code: 'SP.DYN.LE00.IN', theme: 'demographics', ramp: 'RdYlGn' },
  { id: 'fertility', label: 'Fertility rate (births/woman)', code: 'SP.DYN.TFRT.IN', theme: 'demographics', ramp: 'BuPu' },
  { id: 'urban-pct', label: 'Urban population (%)', code: 'SP.URB.TOTL.IN.ZS', theme: 'demographics', ramp: 'PuBu' },
  { id: 'infant-mortality', label: 'Infant mortality (per 1k births)', code: 'SP.DYN.IMRT.IN', theme: 'demographics', ramp: 'OrRd' },
  { id: 'net-migration', label: 'Net migration', code: 'SM.POP.NETM', theme: 'demographics', ramp: 'PiYG' },

  // ── Economy ───────────────────────────────────────────────────────────────────
  { id: 'gdp', label: 'GDP (current US$)', code: 'NY.GDP.MKTP.CD', theme: 'economy', ramp: 'YlGn' },
  { id: 'gdp-per-capita', label: 'GDP per capita (US$)', code: 'NY.GDP.PCAP.CD', theme: 'economy', ramp: 'Greens' },
  { id: 'gdp-per-capita-ppp', label: 'GDP per capita, PPP (int$)', code: 'NY.GDP.PCAP.PP.CD', theme: 'economy', ramp: 'Greens' },
  { id: 'gdp-growth', label: 'GDP growth (%/yr)', code: 'NY.GDP.MKTP.KD.ZG', theme: 'economy', ramp: 'PuBuGn' },
  { id: 'gni-per-capita', label: 'GNI per capita (US$)', code: 'NY.GNP.PCAP.CD', theme: 'economy', ramp: 'Greens' },
  { id: 'inflation', label: 'Inflation (%/yr)', code: 'FP.CPI.TOTL.ZG', theme: 'economy', ramp: 'OrRd' },
  { id: 'unemployment', label: 'Unemployment (%)', code: 'SL.UEM.TOTL.ZS', theme: 'economy', ramp: 'OrRd' },
  { id: 'gini', label: 'Gini index', code: 'SI.POV.GINI', theme: 'economy', ramp: 'YlOrRd' },
  { id: 'exports-pct-gdp', label: 'Exports (% of GDP)', code: 'NE.EXP.GNFS.ZS', theme: 'economy', ramp: 'BuGn' },

  // ── Resources / environment ─────────────────────────────────────────────────────
  { id: 'co2-per-capita', label: 'CO₂ per capita (t)', code: 'EN.GHG.CO2.PC.CE.AR5', theme: 'resources', ramp: 'OrRd' },
  { id: 'forest-pct', label: 'Forest area (%)', code: 'AG.LND.FRST.ZS', theme: 'resources', ramp: 'Greens' },
  { id: 'arable-pct', label: 'Arable land (%)', code: 'AG.LND.ARBL.ZS', theme: 'resources', ramp: 'YlGn' },
  { id: 'agri-land-pct', label: 'Agricultural land (%)', code: 'AG.LND.AGRI.ZS', theme: 'resources', ramp: 'YlGn' },
  { id: 'renewable-energy-pct', label: 'Renewable energy (% of final)', code: 'EG.FEC.RNEW.ZS', theme: 'resources', ramp: 'Greens' },
  { id: 'electricity-access-pct', label: 'Electricity access (%)', code: 'EG.ELC.ACCS.ZS', theme: 'resources', ramp: 'YlOrBr' },
  { id: 'energy-use', label: 'Energy use per capita (kg oil eq)', code: 'EG.USE.PCAP.KG.OE', theme: 'resources', ramp: 'OrRd' },
  { id: 'freshwater-per-capita', label: 'Renewable freshwater per capita (m³)', code: 'ER.H2O.INTR.PC', theme: 'resources', ramp: 'PuBu' },
  { id: 'land-area', label: 'Land area (km²)', code: 'AG.LND.TOTL.K2', theme: 'resources', ramp: 'BuGn' },

  // ── Health ──────────────────────────────────────────────────────────────────────
  { id: 'health-spend-pct-gdp', label: 'Health spending (% of GDP)', code: 'SH.XPD.CHEX.GD.ZS', theme: 'health', ramp: 'RdPu' },
  { id: 'physicians', label: 'Physicians (per 1k)', code: 'SH.MED.PHYS.ZS', theme: 'health', ramp: 'RdYlGn' },
  { id: 'hospital-beds', label: 'Hospital beds (per 1k)', code: 'SH.MED.BEDS.ZS', theme: 'health', ramp: 'RdYlGn' },
]

/** Theme display order + labels for grouping UI (composer). */
export const THEME_ORDER: Theme[] = ['demographics', 'economy', 'resources', 'health']
export const THEME_LABELS: Record<Theme, string> = {
  demographics: 'Demographics',
  economy: 'Economy',
  resources: 'Resources & environment',
  health: 'Health',
}
