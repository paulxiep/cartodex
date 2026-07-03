# Changelog

User-facing changes to Cartodex, the maps you see and interact with. Newest first.
This project follows [Semantic Versioning](https://semver.org).

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
