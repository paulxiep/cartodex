# Changelog

Changes to the maps you see and interact with, newest first. This project follows
[Semantic Versioning](https://semver.org).

## [0.1.1] - 2026-07-03

The platform changes that let several datasets share one map, plus two new data
domains on top: maritime and environmental.

### Maps and views
- Build a map by choosing a view and binding datasets into display channels:
  colour, in-place area, bubbles, markers, arcs, streamlines, and lanes. Each
  channel holds what it can read clearly, so combinations stay legible.
- Two datasets can share a map, for example GDP per capita as colour with
  population as proportional bubbles.
- A colored cartogram resizes each country by one value and colours it by another.
  Skewed measures like population density now read clearly instead of shrinking
  every country to a dot.
- Colour scales spread values that previously washed out, so GDP, population, and
  land area show a fuller range instead of a few saturated countries.
- An Equal Earth (equal-area) view joins the equirectangular, polar, and globe views.
- Country values can be shown as proportional bubbles as well as choropleth fill.
- Clearer base map: land, sea, and borders are easier to tell apart.

### Maritime
- Seaports from the World Port Index, sized by vessel traffic from IMF PortWatch, and
  selectable by ship type: total, container, tanker, or dry bulk (so a
  container hub reads differently from a tanker terminal). Inland river ports such as
  Manaus, Hamburg, and New Orleans are included; a port with no traffic figure is
  drawn at a minimal size.
- The global shipping-lane network, weighted by real ship traffic (World Bank / IMF
  AIS) and split by ship type: cargo (commercial and oil and gas) versus other traffic
  (passenger, leisure, fishing), or any class on its own. Busy corridors draw heavier;
  the plain network is available as a background layer.

### Environment
- Surface winds and ocean currents as streamlines, coloured by layer, drawn heavier
  where the flow is stronger, and now carrying a small arrow so the flow direction is
  clear. Winds show the trade winds and westerlies; currents show the major ocean gyres.

### Data and sources
- Each active layer shows its source. The new layers draw on the NGA World Port
  Index, IMF PortWatch, the World Bank / IMF Global Ship Density, NOAA (winds and
  currents), and the Shipping-Lanes dataset.

## [0.1.0] - 2026-07-01

First release: a composable gallery of world maps.

### Maps and views
- Pick a view and it applies to every layer: an equirectangular world, a polar
  azimuthal-equidistant map, a spin-and-zoom orthographic globe, and a non-contiguous
  cartogram that resizes each country by value.
- Drag to rotate and scroll to zoom the globe and polar views. Your orientation and zoom
  are kept when you toggle layers.

### Country data
- Around 30 World Bank indicators across demographics, economy, resources and environment,
  and health: population, GDP and GDP per capita, life expectancy, fertility, CO2 per
  capita, forest and arable land, renewable energy, and more.
- Each indicator draws as a choropleth on any view, and scales in place under the cartogram.
- Layers are grouped by theme, and each active dataset shows its source and licence.

### Transport
- Airports and flight routes (OpenFlights): airports as sized markers and routes as
  great-circle arcs, best read on the polar map.

### Sharing
- Every combination of view and layers is captured in the page URL, so a map can be
  bookmarked or shared and it reopens exactly as composed.
