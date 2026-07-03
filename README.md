# Cartodex

A composable engine and gallery for maps: projections and cartograms, with data layers that combine freely.

Cartodex is a codex of maps: pick a **view** (an equirectangular plane, an **equal-area** base, a polar **azimuthal-equidistant** map, or a spin/zoom **orthographic globe**) and bind datasets into display **channels** on top of it. View and channels are **orthogonal axes**, so the gallery is a grid of combinations rather than a pile of one-off maps. Under the hood it is a small, typed **engine** with open registries: a new map is a new *dataset* or a new *binding*, not a new bespoke page.

## Architecture

Cartodex is **two orthogonal axes over one typed engine**, rendered as SVG with `d3-geo`. A map is a
**view** plus a set of **channel bindings**; a binding places a **dataset** into a **channel** with a
**scale** (dataset × channel × scale).

- **View axis** (how area geometry is laid out, mutually exclusive): `equirectangular`, `equal-earth` (equal-area base), `azimuthal-equidistant` (polar), `orthographic` (spin/zoom globe).
- **Channel axis** (how a dataset is drawn, composable by capacity): `choropleth` (region→colour), `area` (region→size, an in-place cartogram — needs the equal-area base), `bubble` (region-centroid→size), `marker` (points), `arc` (flows), plus structural `base`. Single-occupancy channels (choropleth/area/bubble) hold one dataset; multi-occupancy (marker/arc) hold many. A **colored cartogram** is `area` + `choropleth` composed; a **bivariate** map is choropleth + bubble. Routes and country relations are the same `arc` channel: topic content is *data*, not new code.
- **Scale**: per-binding `linear | log | quantile | threshold | sqrt`, defaulted per dataset (log/quantile for skewed magnitudes so GDP/population read as differentiated colour, not near-monochrome).
- **Engine, app boundary**: a reusable `engine/` (views, channels, primitives, render; takes a container, holds no datasets or page chrome) and a thin `app/` (gallery, composer, catalog, loaders, presets) that consumes it. The engine is publishable as a standalone package.

| Part | Responsibility |
|------|----------------|
| **Engine, views** | One module per view; `build(w,h)` returns a `Projector` `(lon,lat) => [x,y]` |
| **Engine, channels** | Display modes (`choropleth`/`area`/`bubble`/`marker`/`arc`/`base`) with capacity, over five primitives + a `drawSVG` renderer that projects GeoJSON through the active view |
| **Engine, render** | `createMap(container, { view, layers })`: builds the projector, draws each layer, wires zoom + drag-rotate + tooltips |
| **App** | Domain-neutral catalog (kind + licence + default scale), loaders, binding resolver, named `view × bindings` presets, gallery + composer UI |
| **Producer** | `scripts/build-data.ts`: fetch open sources, join to geometry ids, emit id-keyed snapshots to `public/data/`; per-snapshot weight-budget report |

```
                world-atlas TopoJSON (jsDelivr)            thematic / layer sources
                            | geometry                     (World Bank · OpenFlights)
                            |                                          | fetch + join (producer)
                            v                                          v
┌─ ENGINE (publishable, no datasets/chrome) ─────────┐    ┌─ public/data/*.json (id-keyed snapshots) ─┐
│  views:    equirectangular · equal-earth ·         │    │  open data re-hosted on our CDN            │
│            azimuthal · orthographic                │    └──────────────────┬─────────────────────────┘
│  channels: choropleth · area · bubble · marker ·   │        restricted ──── client-fetch / Worker-proxy
│            arc · base   (dataset × scale)          │                       |
│  render:   createMap() -> SVG via d3-geo           │                       |
└───────────────────────┬─────────────────────────────┘                     |
                        v                                                    v
        per-feature SVG: hover/click/transitions;       ┌─ APP: gallery + composer (consumes engine) ─┐
        drag-rotate + wheel-zoom on globe-like views    │  preset grid of (view × bindings) · view    │
                                                         │  picker · channel slots · attribution       │
                                                         └─────────────────────────────────────────────┘
   delivery: static app on a CDN; snapshots refreshed off-build by a scheduled producer, served same-origin
```

## Tech stack

- **Engine / projections:** `d3-geo` for azimuthal-equidistant, orthographic, and equal-area (Equal Earth) bases; `d3-zoom` + `d3-drag` for pan/zoom and globe rotation
- **Channels / scales:** `d3-scale` (sequential / log / quantile / threshold colour, sqrt size) + `d3-scale-chromatic`; the `area` channel is a per-feature affine transform over the equal-area base (non-contiguous cartogram), composable with `choropleth`
- **Data:** `topojson-client`; world-atlas geometry from a CDN; a licensing-aware per-dataset loader (`baked` / `client` / Worker-proxy)
- **Language / build / quality:** TypeScript (strict), Vite, **pnpm** (global hard-linked store), ESLint (typescript-eslint)
- **Delivery:** static `dist/` served from a CDN; data snapshots are refreshed off-build by a scheduled producer and read same-origin, so an app deploy never waits on a source

## Current state

**M0 scaffold, M1 country fundamentals, and M2 platform architecture complete.** The engine runs on a general **dataset × channel × scale** model: two datasets can share a map, skewed magnitudes read clearly, and the cartogram is a composable area channel.

**M0 — Scaffold** laid the engine: four views (equirectangular, azimuthal-equidistant, orthographic, and a non-contiguous cartogram), the four layer primitives, the gallery + composer (view picker, layer toggles, compatibility gating, attribution), the licensing-aware data loader, and a producer that emits id-keyed snapshots. First data: World Bank population and OpenFlights airports + routes.

**M1 — Country fundamentals** turns the single population layer into a themed catalog and moves data off the app build:

- **A declarative indicator catalog** — around 30 World Bank indicators (CC-BY 4.0) across **demographics, economy, resources/environment, and health**: GDP and GDP per capita, life expectancy, fertility, CO2 per capita, forest and arable land, renewable energy, and more. Each is a `region` choropleth joined to geometry through the ISO-3166 crosswalk, and adding one is a single config row, not new code.
- **Themed composer** — layer toggles are grouped by theme, and any indicator composes with any view (choropleth under the projections, scaled in place under the cartogram).
- **Data off the build** — a scheduled producer fetches the sources and writes the snapshots to private storage; the app reads them same-origin, so the store is never public and an app deploy never depends on a source being up. Each dataset is fetched independently and non-destructively: one source failing never blanks another or overwrites good data with a partial result.
- **Interaction that holds** — toggling a layer keeps the globe/polar orientation and zoom instead of snapping back to the pole.

**M2 — Platform architecture** decoupled the fused "layer" into **dataset × channel × scale**:

- **Display-mode channels** — a dataset binds into a channel (`choropleth`, `area`, `bubble`, `marker`, `arc`) with a capacity. The composer moved from a flat toggle list to **per-channel slots**, so **bivariate** maps (e.g. choropleth GDP per capita + population bubbles) and a **colored cartogram** (area + colour on one path set) are expressible.
- **Scale engine** — linear / log / quantile / threshold colour + sqrt size, defaulted per dataset, so GDP, population, and land area render as differentiated colour instead of "160 near-white countries + 2 saturated".
- **Bubble layer** — a proportional `region-symbol` (centroid bubble) that works across every view, including the polar and globe projections.
- **Domain-neutral catalog** — the WDI-shaped registry became a general `Dataset` catalog (World Bank is one source adapter); `docs/DATA_SOURCES.md` is generated from it, and the producer reports a per-snapshot weight budget.

Strict TypeScript and ESLint pass; `vite build` ships a static `dist/`.

Not wired: detailed energy mix and emissions, agricultural production volumes, mineral reserves, bilateral-trade relations, cargo ports and shipping, prevailing winds and currents (M3), and the contiguous cartogram.

## Roadmap

| Milestone | Capability | Status |
|-----------|-----------|--------|
| **M0, scaffold** | Two-axis engine (`createMap`, view/layer/dataset registries, compatibility table), four layer primitives, gallery + composer, licensing-aware loader, data producer, and the TypeScript + ESLint + Vite + pnpm toolchain | Done |
| **M1 — Country fundamentals** | ~30 World Bank indicators (demographics · economy · resources · health) as themed `region` choropleths from a declarative catalog; data decoupled from the build (scheduled producer → private storage, read same-origin); interaction state preserved across layer toggles | Done |
| **M2 — Platform architecture** | dataset × channel × scale model; display-mode channels + per-channel composer (bivariate maps); scale engine (log/quantile/threshold colour, sqrt size) fixing magnitude skew; `region-symbol` bubble layer; area-channel colored cartogram; domain-neutral catalog + generated `DATA_SOURCES.md` + weight-budget report | Done |
| **M3 — Maritime & environmental** | seaports, shipping routes (real sea-lane paths), prevailing winds and ocean currents via a new `grid`/`field` channel | Planned |

Later milestones are refined here as work is defined.

## License

Cartodex is licensed under the [GNU Affero General Public License v3.0](LICENSE). Commercial or proprietary use beyond AGPL compliance is available separately from the copyright holder; the project uses a Contributor License Agreement to keep that option open. See [LICENSING_STRATEGY.md](LICENSING_STRATEGY.md).

## Contributing

Contributions are welcome. Contributors sign a Contributor License Agreement (License Grant); see [CONTRIBUTING.md](CONTRIBUTING.md).

---

### Keywords

- **Maps & projections:** `d3-geo` · `Azimuthal Equidistant (Polar)` · `Orthographic` · `Equirectangular` · `Cartogram (Non-contiguous)` · `Density-Equalizing (D∘P, equal-area base)` · `Great-Circle Densification`
- **Architecture:** `Two Orthogonal Axes (View x Layers)` · `Layer Primitives x Datasets` · `Routes = Relations (flow)` · `Engine / App Boundary` · `Open View/Layer/Dataset Registries` · `Compatibility Table` · `Publishable Engine`
- **Data & licensing:** `TopoJSON (world-atlas)` · `World Bank WDI · OpenFlights` · `Licensing-Aware Loader (baked · client-fetch · Worker-proxy)` · `Attribution / Display Rights` · `Id-Keyed Snapshots` · `Geometry-Join Crosswalk (ISO-3166)` · `Off-Build Scheduled Producer`
- **Country data:** `World Bank WDI (CC-BY 4.0)` · `~30 Indicators (Demographics · Economy · Resources · Health)` · `Declarative Indicator Registry` · `Themed Layer Grouping` · `Latest Non-Null Value Select (mrv)`
- **Toolchain & delivery:** `TypeScript (strict)` · `ESLint (typescript-eslint)` · `Vite` · `pnpm (global hard-linked store)` · `Static App on CDN` · `Off-Build Producer` · `Private Storage, Same-Origin Read`
