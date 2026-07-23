# Cartodex, Architecture

This document is the deep design behind the [README](../README.md). It explains why the engine is
shaped the way it is, so that adding a map later is a mechanical act (register a view, or add a
dataset) rather than a redesign.

## 1. Two orthogonal axes: view × channel bindings

A map in cartodex is a **view** plus a set of **channel bindings**:

```
map = View × { channel: dataset (with a scale) }*
```

- A **View** decides how area geometry is laid out on screen (the projection). Exactly one is active:
  `equirectangular`, `equal-earth` (an equal-area base), `azimuthal-equidistant` (polar), or
  `orthographic` (spin/zoom globe).
- A **channel binding** places a **dataset** into a display **channel** (with a **scale**). Many
  compose freely, subject to each channel's capacity.

Modeling these as independent axes is the core factoring. It turns `O(views × datasets)` hand-built
maps into `O(views + channels + datasets)` engine pieces. The gallery is a grid of preset cells, and a
"new map" is usually just a new dataset row or a new binding, with no new code.

### Dataset × Channel × Scale (M2)

A "layer" is not one fused thing; it is three decoupled concepts, so the same dataset can be shown many
ways and two datasets can share a map:

- **Dataset** — display-agnostic values + metadata (`src/app/catalog.ts`). Kinds: `region` (keyed by
  numeric ISO), `point` (lon/lat), `pair` (flow endpoints), `grid` (vector field, baked to streamlines),
  `lines` (a baked LineString network, e.g. shipping lanes), `surface` (a baked scalar field contoured
  to value-carrying polygon bands, e.g. elevation).
- **Channel** — how values map to a visual variable, with a **capacity** (`src/engine/channels.ts`):
  - *single-occupancy* (a second selection replaces the first): `choropleth` (region→colour),
    `area` (region→size, an in-place cartogram), `bubble` (region-centroid→size), `surface`
    (a scalar field as a full-map relief/heatmap fill — one background at a time).
  - *multi-occupancy* (distinguished by style): `marker` (points), `arc` (flows), `field` (gridded
    vector streamlines — winds, currents), `lane` (a baked line network drawn as context).
  - *structural*: `base` (land/borders, no dataset).
- **Scale** — `{ type: linear | log | quantile | threshold | sqrt, ramp }`, defaulted per dataset
  (log/quantile for skewed magnitudes) and overridable per binding (`src/engine/lib/scales.ts`).

Consequences that fall out: **bivariate maps** (e.g. choropleth GDP + bubble population), a **skew
fix** (magnitudes read as sqrt bubbles or log/quantile colour instead of near-monochrome), and a
**colored cartogram** (`area` + `choropleth` compose on one path set — not exclusive).

### Why a cartogram is a channel, not a view

A projection is a pure function `P: (lon,lat) -> (x,y)`. A non-contiguous cartogram scales each region
in place by value on top of `P`. Because it only *decorates* region geometry (like a choropleth fill
does), it is an **area encoding on the region primitive**, not a separate spatial layout — so it is the
single-occupancy **`area` channel**, and it composes with `choropleth` (colour) on the same path set.
Its one constraint: density-equalization assumes true areas, so `area` requires an **equal-area base**
(`equal-earth`). `compatible(view, channel)` gates exactly that; every other channel is valid on all
views. (Earlier drafts modeled the cartogram as a `D ∘ P` *view*; M2 reconciled it as an area channel
so colour and area can combine.)

## 2. Channels reduce to seven primitives by datasets

Topic content (flights, demographics, resources, relations, winds) is not separate code paths. Every
channel draws through one of seven rendering **primitives**, each parameterized by a **dataset**:

| Primitive | Renders | Channels | Example datasets |
|-----------|---------|----------|------------------|
| `base`          | land / borders | `base` | world-atlas land + country mesh |
| `region`        | choropleth fill and/or in-place area scaling | `choropleth`, `area` | population, GDP, any fundamental |
| `region-symbol` | proportional bubble at a region centroid | `bubble` | population, GDP magnitudes |
| `point`         | sized markers at coordinates | `marker` | airports, seaports |
| `flow`          | weighted arcs between geo-nodes | `arc` | flight routes; political relations |
| `field`         | per-feature lines, width by magnitude | `field`, `lane` | surface winds, ocean currents; shipping lanes |
| `surface`       | scalar contour bands, filled by value | `surface` | elevation & bathymetry (relief) |

The key collapse: a flight route and a political relation are the same shape (a weighted edge), so both
are `arc` over the `flow` primitive with different data; likewise the shipping-lane network rides the
`field` primitive (per-feature width by traffic), the same one that draws winds and currents. A colored
cartogram is not a new primitive: it is the `region` primitive carrying both a colour binding and an
area binding.

## 3. One render backend, one layer contract

Views render in **SVG** via `d3-geo`. Feature counts are modest (hundreds to a few thousand
polygons), and per-feature SVG DOM gives free hover/click/tooltip/transition. Globe-like views
(orthographic, azimuthal) add drag-to-rotate and wheel-zoom by mutating the projection and
repainting.

A view contributes a `Projector`; a primitive contributes a `drawSVG` that projects its GeoJSON
through that projector. The app resolves channel bindings into `ResolvedLayer`s (loading data, picking
scales, **merging a `choropleth` + `area` binding into one region layer**) and hands them to
`createMap`; it enforces `compatible(view, channel)` at that point, so the renderer just draws what it
is given.

```ts
interface Projector {
  project(coord: [number, number]): [number, number] | null  // null = clipped (e.g. globe backside)
  path: GeoPath | null                                        // d3 path for area/line features
  projection: GeoProjection | null                            // raw projection (graticule, rotate)
}

interface View {
  id: ViewId
  kind: 'projection'
  equalArea?: boolean       // required by the `area` channel
  rotatable?: boolean
  build(width: number, height: number): Projector
}

interface PrimitiveRenderer {
  drawSVG(group: SvgGroup, layer: ResolvedLayer, ctx: RenderContext): void
}
```

**Rendering per primitive**, the subtle parts:

- *Great-circle flows*: densify `flow` LineStrings first so they curve correctly; on globe-like
  projections geoPath clips back-hemisphere arcs for free.
- *Point-like marks* (`point`, `region-symbol`): d3 does not clip points, so a shared far-side test
  (`lib/clip.ts`) drops marks on a globe's hidden hemisphere.
- *Area encoding*: the `region` primitive scales each feature around its **screen-space centroid**
  (`path.centroid`) by `sqrt(value / max)` when an `area` binding is present, on an equal-area base.

### Projection-invariant geometry (spherical base coordinate)

Spherical **lon/lat is the canonical base coordinate**: the invariant truth of where things are on
Earth. The four views (flat equirectangular/equal-earth, sphere orthographic, radial polar) are just
different **flattenings** of that sphere, which is exactly d3-geo's model — data on the sphere, a
projection maps sphere→plane. So the view and layer axes are genuinely orthogonal: the render path
has **no view-specific branches**; a primitive projects the same GeoJSON identically under every
projection.

The corollary is a boundary rule: **producing valid, seamless-on-the-sphere geometry is a build-time
/ data-layer responsibility, kept strictly outside the projection layer.** A valid spherical polygon
is projection-invariant; a malformed one (wrong ring winding, a degenerate antimeridian seam, an
unclosed ring) can render differently per flattening — the strict whole-sphere polar view exposes
defects the antimeridian-cutting flat views and the hemisphere-clipping globe forgive. The engine
therefore trusts its input geometry and never "fixes" it per projection; the producers emit geometry
that is already valid on the sphere (see §5, the surface contour bands).

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
  The dynamic snapshots refresh on a schedule via a Cloudflare **Worker** producer (`deploy/producer/`)
  running the same fetch-based builders into R2; snapshots derived from a WASM decoder (LERC-weighted
  shipping lanes) or fixed climatology (winds, currents) are static, so they are built locally and
  seeded once instead of re-run on the cron.

Cartograms are computed **client-side** from `{ geometry + value table }` so variable toggles stay
live; we never bake distorted geometry. `public/data/` is gitignored: it is a reproducible build
artifact, not source.

### Licensing-aware loader

Baking a dataset onto our CDN is redistribution. So each dataset declares a `DataSource` mode:

```ts
type DataSource =
  | { mode: 'baked';  snapshot: string }                         // open license, re-hosted snapshot (basename)
  | { mode: 'client'; url: string; join: JoinSpec }              // restricted, runtime fetch, not re-hosted
```

- `baked`: open data (public domain, CC0/CC-BY, World Bank open, OpenFlights ODbL), normalized and re-hosted. The `snapshot` is a bare filename; `data-loaders.ts` resolves it against the CDN base, so the pure `catalog.ts` never encodes a host.
- `client`: redistribution-restricted but CORS-enabled. The browser fetches from the licensor at runtime; we never host a copy. Display and attribution terms still apply, and no secret keys client-side.
- **Worker-proxy** (escape hatch): when a source is no-CORS or keyed, a Cloudflare Pages Function injects the key / adds CORS, forwarding without storing.

Loaders in `data-loaders.ts` branch on the mode; downstream primitive code is identical. Required
**attribution** is rendered for every active dataset, and `docs/DATA_SOURCES.md` is generated from the
catalog (`pnpm gen-docs`) so the licence ledger never drifts.

### Wired sources (scaffold)

| Layer | Source | License | Mode |
|-------|--------|---------|------|
| population (`region`) | World Bank `SP.POP.TOTL`, joined via ISO-3166 crosswalk | open | baked |
| airports (`point`) | OpenFlights | ODbL (attribution) | baked |
| flight routes (`flow`) | OpenFlights routes, aggregated by airport pair (top routes by frequency) | ODbL (attribution) | baked |

M3 adds the maritime and environment domains, all from real open sources. On the redistributability of
shipping: route *geometry* and *AIS traffic density* are open, even though proprietary
origin-destination *volume* matrices (Lloyd's, Clarksons) are not — so cartodex uses the **real
shipping-lane network** (newzealandpaul/Shipping-Lanes, CC BY-SA) and **weights each lane by real AIS
traffic per ship type**, sampled at build time from the **World Bank / IMF Global Ship Density** rasters
(cargo = commercial + oil & gas; other = passenger + leisure + fishing). The density services are
ArcGIS `TilesOnly`, but their tiles are LERC (real Int32 values), so the producer fetches the tiles the
lanes cross and decodes them — no shortest-path routing, no proxied weight. **Seaports** are the NGA
World Port Index joined to IMF PortWatch AIS traffic, selectable by vessel type (total / cargo /
container / tanker / dry bulk). Winds and currents are real gridded fields (FNMOC, Aviso via NOAA
ERDDAP) integrated into streamlines at build time. Where a port or lane has no traffic datum it renders
empty / unweighted — never faked.

M4 adds a **hazards** domain (USGS earthquakes — recent significant + great historic; NOAA NCEI
volcanoes; fraxen/tectonicplates plate boundaries, ODC-BY) and a **society** domain (World Bank
connectivity/education/research indicators), plus reference geography (Natural Earth cities and rivers)
and submarine cables. It is a datasets-and-producers-only pass with **zero engine change** — every new
layer rides the existing `marker` (point), `lane` (lines), and `choropleth` (region) channels. Rivers
carry an inverted Natural Earth `scalerank` so the `lane` channel draws major rivers wider. Cables come
from **OpenStreetMap via Overpass (ODbL)**; TeleGeography was rejected as CC BY-NC-SA (non-commercial +
share-alike). OSM cable coverage is thinner than proprietary sets, so a build guard ships only what OSM
actually has rather than padding — never faked.

M5 adds the **`surface`** encoding: a scalar field (a magnitude per cell, no direction — the sibling
of M3's vector `field`) rendered as build-time **hypsometric contour bands** filled by value. The
first dataset is **elevation & bathymetry** from **ETOPO1** (NOAA NGDC, public domain, via NOAA
CoastWatch ERDDAP): one grid covers land relief and ocean depth, so a single **diverging sea/land
colour ramp** centred at sea level reads as a complete relief-and-bathymetry map (a general scale
capability — `ScaleSpec.diverging`, per-side ramps meeting at a pivot). Because the backend is
SVG-only, the surface is the SVG-native form of a heatmap: the producer runs marching squares
(`d3-contour`, build-time) at a shared hypsometric level list — the same levels are the colour
thresholds, so each band's `value` maps to its own swatch. It composes as a single-occupancy
**background** (relief under earthquakes; a future SST surface under currents), with the `base` layer
rendered borders-only over it. The geometry work — contouring, the grid→lon/lat transform, and
emitting valid full-sphere bands **cut at the antimeridian** so they render seamlessly under every
projection — lives in one shared build-layer factory, `scripts/sources/environment/adapters/
contourBands.ts` (per §3's projection-invariant-geometry rule); the `elevation` builder is a thin
fetch over it, and future scalar surfaces (SST, climate) are the same two lines against a different
variable.

## 6. How to add a map

- **A new projection**: add a `View` module under `engine/views/`, register it (set `equalArea` if it
  is). Every channel works under it for free, except those gated by `compatible(view, channel)`.
- **A new topic dataset**: usually no engine change. Add a `Dataset` row to `app/catalog.ts` (plus
  crosswalk entries and a producer that writes its snapshot); bind it from a preset. A region dataset
  is instantly available as choropleth, area, and bubble.
- **A genuinely new display mode**: add a `Channel` row (`engine/channels.ts`) and, if it needs a new
  draw routine, a primitive under `engine/primitives/`. This is rare; M3 added the `field` primitive
  and drew both winds/currents (`field` channel) and the shipping-lane network (`lane` channel) through
  it, and M5 added the `surface` primitive (scalar contour bands) for elevation and future scalar fields.

## 7. Toolchain & delivery

- **Docker-first dev**: `docker compose up` runs Vite in `node:24-alpine` on 5173; `docker compose
  down` is a clean kill switch (a native orphan dev-server is hard to see/kill on Windows). Bind-mount
  file events propagate without polling; `node_modules` is a named volume so container Linux deps stay
  isolated from the host. Native `pnpm dev` still works. **pnpm** uses a global hard-linked store that
  dedupes dependencies across the whole local workspace.
- **Vite + TypeScript (strict) + ESLint**: multi-page (`index.html` gallery + `compose.html`
  composer), relative `base` so the build serves from any host root.
- **Cloudflare Pages + custom domain**: `pnpm build` produces `dist/`; a scheduled Cloudflare Worker
  (`deploy/producer/`) refreshes the dynamic data snapshots into R2 and serves them same-origin at
  `/data/*`. A Worker can also front a licence-restricted source as a proxy.
