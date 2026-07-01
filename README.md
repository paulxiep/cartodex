# Cartodex

A composable engine and gallery for maps: projections and cartograms, with data layers that combine freely.

Cartodex is a codex of maps: pick a **view** (an equirectangular plane, a polar **azimuthal-equidistant** map, a spin/zoom **orthographic globe**, or a data-driven **cartogram**) and toggle **layers** on top of it. The two are **orthogonal axes** (any view by any compatible layers), so the gallery is a grid of combinations rather than a pile of one-off maps. Under the hood it is a small, typed **engine** with open registries: a new map is a new *view* or a new *dataset*, not a new bespoke page.

## Architecture

Cartodex is **two orthogonal axes over one typed engine**, rendered as SVG with `d3-geo`.

- **View axis** (how area geometry is laid out, mutually exclusive): `equirectangular`, `azimuthal-equidistant` (polar), `orthographic` (spin/zoom globe), and `cartogram` (`noncontiguous`). A cartogram is itself a **view**, not a separate axis: it is `D ∘ P`, a data-driven distortion over an **equal-area** base, so it owns the area layout and is mutually exclusive with the other projections.
- **Layer axis** (what is drawn on top, freely composable), reduced to **four primitives driven by datasets**: `base` (land/borders), `region` (choropleth fill by value), `point` (sized/colored markers), `flow` (an arc between two geo-nodes). Routes and country relations are the same `flow` primitive: topic content is *data*, not new code.
- **Engine, app boundary**: a reusable `engine/` (views, layer framework, render; takes a container, holds no datasets or page chrome) and a thin `app/` (gallery, composer, dataset registry, presets) that consumes it. The engine is publishable as a standalone package.

| Part | Responsibility |
|------|----------------|
| **Engine, views** | One module per view; `build(w,h)` returns a `Projector` `(lon,lat) => [x,y]` (plus a displacement field for cartograms) |
| **Engine, layers** | Four primitives (`base`/`region`/`point`/`flow`) as GeoJSON + a `drawSVG` renderer that projects them through the active view |
| **Engine, render** | `createMap(container, { view, layers })`: builds the projector, draws each layer, wires zoom + drag-rotate + tooltips |
| **App** | Dataset registry (licensing-aware loader + attribution + join keys), named `view x layers` presets, gallery + composer UI |
| **Producer** | `scripts/build-data.ts`: fetch open sources, join to geometry ids, emit id-keyed snapshots to `public/data/` |

```
                world-atlas TopoJSON (jsDelivr)            thematic / layer sources
                            | geometry                     (World Bank · OpenFlights)
                            |                                          | fetch + join (producer)
                            v                                          v
┌─ ENGINE (publishable, no datasets/chrome) ─────────┐    ┌─ public/data/*.json (id-keyed snapshots) ─┐
│  views:  equirectangular · azimuthal · orthographic│    │  open data re-hosted on our CDN            │
│          · cartogram(noncontiguous)                │    └──────────────────┬─────────────────────────┘
│  layers: base · region · point · flow  (x datasets)│        restricted ──── client-fetch / Worker-proxy
│  render: createMap() -> SVG via d3-geo             │                       |
└───────────────────────┬─────────────────────────────┘                     |
                        v                                                    v
        per-feature SVG: hover/click/transitions;       ┌─ APP: gallery + composer (consumes engine) ─┐
        drag-rotate + wheel-zoom on globe-like views    │  preset grid of (view x layers) · view      │
                                                         │  picker · layer toggles · attribution       │
                                                         └─────────────────────────────────────────────┘
   delivery: static build -> CDN; scheduled rebuild refreshes data
```

## Tech stack

- **Engine / projections:** `d3-geo` for azimuthal-equidistant, orthographic, and equal-area (Equal Earth) bases; `d3-zoom` + `d3-drag` for pan/zoom and globe rotation
- **Cartograms:** a per-feature affine transform over an equal-area base (non-contiguous)
- **Data:** `topojson-client`; world-atlas geometry from a CDN; a licensing-aware per-dataset loader (`baked` / `client` / Worker-proxy)
- **Language / build / quality:** TypeScript (strict), Vite, **pnpm** (global hard-linked store), ESLint (typescript-eslint)
- **Delivery:** static `dist/` served from a CDN; a scheduled rebuild refreshes the baked data

## Current state

**M0, scaffold.** The two-axis engine runs end to end: four views (equirectangular, azimuthal-equidistant, orthographic, and a non-contiguous cartogram), the four layer primitives, the gallery + composer (view picker, layer toggles, compatibility gating, attribution), the licensing-aware data loader, and a producer that bakes the data. The wired datasets are World Bank population (215 countries, joined to geometry through the ISO-3166 crosswalk) and OpenFlights airports + routes. Strict TypeScript and ESLint pass; `vite build` ships a static `dist/`.

Not wired in the scaffold: cargo ports, shipping and relations `flow` data, and the contiguous cartogram.

## Roadmap

| Milestone | Capability | Status |
|-----------|-----------|--------|
| **M0, scaffold** | Two-axis engine (`createMap`, view/layer/dataset registries, compatibility table), four layer primitives, gallery + composer, licensing-aware loader, data producer, and the TypeScript + ESLint + Vite + pnpm toolchain | Done |

Later milestones are not scoped yet and will be added here as work is defined.

## License

Cartodex is licensed under the [GNU Affero General Public License v3.0](LICENSE). Commercial or proprietary use beyond AGPL compliance is available separately from the copyright holder; the project uses a Contributor License Agreement to keep that option open. See [LICENSING_STRATEGY.md](LICENSING_STRATEGY.md).

## Contributing

Contributions are welcome. Contributors sign a Contributor License Agreement (License Grant); see [CONTRIBUTING.md](CONTRIBUTING.md).

---

### Keywords

- **Maps & projections:** `d3-geo` · `Azimuthal Equidistant (Polar)` · `Orthographic` · `Equirectangular` · `Cartogram (Non-contiguous)` · `Density-Equalizing (D∘P, equal-area base)` · `Great-Circle Densification`
- **Architecture:** `Two Orthogonal Axes (View x Layers)` · `Layer Primitives x Datasets` · `Routes = Relations (flow)` · `Engine / App Boundary` · `Open View/Layer/Dataset Registries` · `Compatibility Table` · `Publishable Engine`
- **Data & licensing:** `TopoJSON (world-atlas)` · `World Bank · OpenFlights` · `Licensing-Aware Loader (baked · client-fetch · Worker-proxy)` · `Attribution / Display Rights` · `Id-Keyed Snapshots` · `Geometry-Join Crosswalk (ISO-3166)` · `Scheduled Producer Rebuild`
- **Toolchain & delivery:** `TypeScript (strict)` · `ESLint (typescript-eslint)` · `Vite` · `pnpm (global hard-linked store)` · `Static Build on CDN` · `Scheduled Rebuild`
