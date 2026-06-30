# Cartodex, Architecture

This document is the deep design behind the [README](../README.md). It explains why the engine is
shaped the way it is, so that adding a map later is a mechanical act (register a view, or add a
dataset) rather than a redesign.

## 1. Two orthogonal axes

A map in cartodex is a pair:

```
map = View x Layers
```

- A **View** decides how area geometry is laid out on screen (the projection, or distortion). Exactly one view is active at a time.
- **Layers** decide what is drawn on top (land, values, points, flows). Many compose freely.

Modeling these as independent axes is the core factoring. It turns `O(views x layers)` hand-built
maps into `O(views + layers)` engine pieces: implement each view once, each layer once, and every
combination is reachable. The gallery is then a grid of cells, and a "new map" is usually just a new
cell, with no new code.

### Why a cartogram is a View, not a third axis

A projection is a pure function `P: (lon,lat) -> (x,y)`. A contiguous cartogram is a data-driven
distortion `D` applied in projected space:

```
cartogram = D ∘ P
```

Two consequences fix its place in the design:

1. **It owns area layout.** `D ∘ P` produces the final planar position of area features, so for a
   given set of regions it is mutually exclusive with "show the true shapes under projection `P`".
   That is exactly what the **View** axis arbitrates, so a cartogram is a member of the view axis.
2. **Its base must be equal-area.** Density-equalization assumes you begin from true areas. The
   azimuthal-equidistant and orthographic views are not equal-area, so a cartogram cannot be layered
   on them; it builds on an equal-area (Equal Earth) base internally.

So the registered view axis is `equirectangular`, `azimuthal-equidistant`, `orthographic`, and
`cartogram{noncontiguous}`. A `compatible(view, layer)` table disables cells that have no meaning
(e.g. cartogram by point/flow) rather than rendering nonsense. (The contiguous flow-based cartogram
is designed for but not yet implemented.)

## 2. Layers reduce to four primitives by datasets

Topic layers (flights, demographics, resources, political climate, relations) are not separate code
paths. They reduce to four rendering **primitives**, each parameterized by a **dataset**:

| Primitive | Renders | Example datasets |
|-----------|---------|------------------|
| `base`    | land / borders | world-atlas land + country mesh |
| `region`  | choropleth fill by a per-region value | population, GDP, resources, regime type, any country fundamental |
| `point`   | sized / colored markers at coordinates | airports, ports, capitals |
| `flow`    | an arc between two geo-nodes, weighted/colored | flight routes, and trade / alliance / conflict relations |

The key collapse: a flight route and a political relation are the same shape, a weighted edge between
two geo-nodes, so both are the `flow` primitive with different data. Adding a country-fundamentals
layer is therefore mostly a **producer + dataset** exercise (Section 5), not new engine code.

## 3. One render backend, one layer contract

Views render in **SVG** via `d3-geo`. Feature counts are modest (hundreds to a few thousand
polygons), and per-feature SVG DOM gives free hover/click/tooltip/transition. Globe-like views
(orthographic, azimuthal) add drag-to-rotate and wheel-zoom by mutating the projection and
repainting.

A view contributes a `Projector`; a layer contributes a `drawSVG` that projects its GeoJSON through
that projector:

```ts
interface Projector {
  project(coord: [number, number]): [number, number] | null  // null = clipped (e.g. globe backside)
  path: GeoPath | null                                        // d3 path for area/line features
  projection: GeoProjection | null                            // raw projection (graticule, rotate)
}

interface View {
  id: ViewId
  kind: 'projection' | 'cartogram'
  cartogramKind?: 'noncontiguous'
  rotatable?: boolean
  build(width: number, height: number): Projector
}

interface PrimitiveRenderer {
  drawSVG(group: SvgGroup, layer: ResolvedLayer, ctx: RenderContext): void
}
```

**Registering a layer against the active view** is the one subtle part:

- *Projection view*: project each vertex through `P`. Densify great-circle `flow` lines first so they
  curve correctly; on globe-like projections, drop vertices where `project` returns `null` (back
  hemisphere, `clipAngle(90)`).
- *Cartogram view*: the `region` primitive owns the distortion because it owns the values. It reads
  `cartogramKind` and lays areas out as non-contiguous scaled shapes (each region scaled in place
  around its centroid by value, over an equal-area base).

## 4. Engine, app boundary

```
src/engine/   reusable core: views, primitives, render, lib. Takes a container element.
              NO hard-coded datasets. NO page chrome. Publishable as a package.
src/app/      consumes the engine: dataset registry, presets, gallery + composer UI, attribution.
```

The single public entry point:

```ts
createMap(container: HTMLElement, opts: {
  view: ViewId
  layers: ResolvedLayer[]   // primitive + resolved GeoJSON + values + style, built by the app
}): MapHandle               // { setView, setLayers, destroy }
```

**Invariant:** `src/engine/` imports nothing from `src/app/`. This is what lets cartodex later ship
as a private npm package consumed by a separate app: that app brings its own dataset registry and
chrome and reuses the same engine.

## 5. Data: geometry, datasets, and licensing

Two very different inputs:

- **Geometry**: `world-atlas` TopoJSON from a CDN. Static, open, keyed by **ISO 3166-1 numeric**.
  Decoded with `topojson-client`. Never committed.
- **Thematic / layer values**: the part that updates and rarely arrives clean. The friction is the
  **join key** (sources use country names, ISO alpha-2/-3, or custom codes, and disagree on edge
  cases like Kosovo or Taiwan), not the transport. A **producer** (`scripts/build-data.ts`)
  normalizes and joins source to geometry id, emitting small, id-keyed `public/data/<set>.json`.
  Periodic update is a scheduled rebuild (GitHub Action cron or Cloudflare deploy hook).

Cartograms are computed **client-side** from `{ geometry + value table }` so variable toggles stay
live; we never bake distorted geometry. `public/data/` is gitignored: it is a reproducible build
artifact, not source.

### Licensing-aware loader

Baking a dataset onto our CDN is redistribution. So each dataset declares a `DataSource` mode:

```ts
type DataSource =
  | { mode: 'baked';  url: string }                              // open license, re-hosted snapshot
  | { mode: 'client'; url: string; join: JoinSpec }              // restricted, runtime fetch, not re-hosted
```

- `baked`: open data (public domain, CC0/CC-BY, World Bank open, OpenFlights ODbL), normalized and re-hosted.
- `client`: redistribution-restricted but CORS-enabled. The browser fetches from the licensor at runtime; we never host a copy. Display and attribution terms still apply, and no secret keys client-side.
- **Worker-proxy** (escape hatch): when a source is no-CORS or keyed, a Cloudflare Pages Function injects the key / adds CORS, forwarding without storing.

`loadValues(dataset)` branches on the mode; downstream layer code is identical. Required
**attribution** is rendered for every active dataset.

### Wired sources (scaffold)

| Layer | Source | License | Mode |
|-------|--------|---------|------|
| population (`region`) | World Bank `SP.POP.TOTL`, joined via ISO-3166 crosswalk | open | baked |
| airports (`point`) | OpenFlights | ODbL (attribution) | baked |
| flight routes (`flow`) | OpenFlights routes, aggregated by airport pair (top routes by frequency) | ODbL (attribution) | baked |

Ports, shipping/relations `flow` data, and cargo-specific filtering are not wired in the scaffold.
The World Port Index (NGA, public domain) is a candidate for ports; global cargo ship routing is
largely proprietary (AIS).

## 6. How to add a map

- **A new projection**: add a `View` module under `engine/views/`, register it, and set its
  compatibility. Every existing layer works under it for free.
- **A new topic layer**: usually no engine change. Add a `DataSource` to the app's `datasets.ts`
  (plus crosswalk entries) and reference it from a `region`/`point`/`flow` layer spec or a preset.
- **A genuinely new render shape**: add a primitive under `engine/primitives/` with its `drawSVG`.
  This should be rare; the four primitives cover the planned roadmap.

## 7. Toolchain & delivery

- **pnpm on host**: a global hard-linked store dedupes dependencies across the whole `portfolio/`
  folder and is monorepo-ready. No Docker (no cross-project dedup; Windows HMR friction).
- **Vite + TypeScript (strict) + ESLint**: multi-page (`index.html` gallery + `compose.html`
  composer), relative `base` so the build serves from any host root.
- **Cloudflare Pages + custom domain**: `pnpm build` produces `dist/`; a scheduled rebuild refreshes
  data; a Cloudflare Worker is added only as the licensing proxy.
