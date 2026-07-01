// The composer: pick a View, toggle Layers, and the engine recomposes. State lives in
// the URL hash (#view=...&layers=a,b,c) so any combination is shareable/deep-linkable.
// Incompatible (view × primitive) cells are disabled via the engine's compatible().

import { createMap, getView, compatible, VIEW_LIST } from '../engine'
import type { MapHandle, ViewId } from '../engine'
import { LAYER_LIST, LAYERS, buildLayers, attributionsFor } from './layers'
import type { LayerDef } from './layers'
import { DATASETS } from './datasets'
import { THEME_ORDER, THEME_LABELS } from './indicators'
import { PRESETS } from './presets'

// Group layer toggles for display: one section per indicator theme (in catalog order),
// then a trailing "Base & transport" section for structural / non-themed layers.
function groupedLayers(): Array<{ label: string; defs: LayerDef[] }> {
  const byTheme = new Map<string, LayerDef[]>()
  const other: LayerDef[] = []
  for (const def of LAYER_LIST) {
    const theme = def.datasetId ? DATASETS[def.datasetId]?.theme : undefined
    if (theme) (byTheme.get(theme) ?? byTheme.set(theme, []).get(theme)!).push(def)
    else other.push(def)
  }
  const groups = THEME_ORDER.filter((t) => byTheme.has(t)).map((t) => ({
    label: THEME_LABELS[t],
    defs: byTheme.get(t)!,
  }))
  if (other.length) groups.push({ label: 'Base & transport', defs: other })
  return groups
}

interface State {
  view: ViewId
  layers: string[]
}

const DEFAULT: State = { view: PRESETS[0]!.view, layers: PRESETS[0]!.layers }

function parseHash(): State {
  const h = location.hash.replace(/^#/, '')
  const params = new URLSearchParams(h)
  const view = (params.get('view') as ViewId | null) ?? DEFAULT.view
  const layersParam = params.get('layers')
  const layers = layersParam ? layersParam.split(',').filter((id) => id in LAYERS) : DEFAULT.layers
  const known = VIEW_LIST.some((v) => v.id === view)
  return { view: known ? view : DEFAULT.view, layers }
}

function writeHash(state: State): void {
  const next = `#view=${state.view}&layers=${state.layers.join(',')}`
  if (location.hash !== next) history.replaceState(null, '', next)
}

function compatibleLayers(state: State): string[] {
  const view = getView(state.view)
  return state.layers.filter((id) => {
    const def = LAYERS[id]
    return def != null && compatible(view, def.primitive)
  })
}

export async function mountComposer(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    <aside class="panel">
      <a class="back" href="${import.meta.env.BASE_URL}">← gallery</a>
      <h1>Cartodex</h1>
      <section><h2>View</h2><div class="views" id="views"></div></section>
      <section><h2>Layers</h2><div class="layers" id="layers"></div></section>
    </aside>
    <main class="stage">
      <div id="map" class="map"></div>
      <footer id="attribution" class="attribution"></footer>
    </main>`

  const mapEl = root.querySelector<HTMLDivElement>('#map')!
  const viewsEl = root.querySelector<HTMLDivElement>('#views')!
  const layersEl = root.querySelector<HTMLDivElement>('#layers')!
  const attrEl = root.querySelector<HTMLElement>('#attribution')!

  let state = parseHash()
  let handle: MapHandle | null = null
  // Layers requested this render whose dataset failed to load (snapshot missing / source
  // down). The toggles stay on so they recover on the next attempt, but are flagged.
  const unavailable = new Set<string>()

  // View picker
  for (const v of VIEW_LIST) {
    const btn = document.createElement('button')
    btn.className = 'view-btn'
    btn.dataset['view'] = v.id
    btn.textContent = v.label
    btn.addEventListener('click', () => void setView(v.id))
    viewsEl.appendChild(btn)
  }

  // Layer toggles, grouped by theme
  for (const group of groupedLayers()) {
    const heading = document.createElement('h3')
    heading.className = 'layer-group'
    heading.textContent = group.label
    layersEl.appendChild(heading)
    for (const def of group.defs) {
      const id = `layer-${def.id}`
      const label = document.createElement('label')
      label.className = 'layer-row'
      label.innerHTML = `<input type="checkbox" id="${id}" /> <span>${def.label}</span>`
      const input = label.querySelector('input')!
      input.addEventListener('change', () => toggleLayer(def.id, input.checked))
      layersEl.appendChild(label)
    }
  }

  function refreshControls(): void {
    const view = getView(state.view)
    viewsEl.querySelectorAll<HTMLButtonElement>('.view-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset['view'] === state.view)
    })
    for (const def of LAYER_LIST) {
      const input = layersEl.querySelector<HTMLInputElement>(`#layer-${def.id}`)!
      const ok = compatible(view, def.primitive)
      input.disabled = !ok
      input.checked = ok && state.layers.includes(def.id)
      const row = input.closest('.layer-row')!
      row.classList.toggle('disabled', !ok)
      const missing = unavailable.has(def.id)
      row.classList.toggle('unavailable', missing)
      ;(row as HTMLElement).title = missing ? 'data unavailable' : ''
    }
    const attrs = attributionsFor(compatibleLayers(state))
    attrEl.textContent = attrs.length ? attrs.join('  ·  ') : ''
  }

  async function apply(rebuildView: boolean): Promise<void> {
    const ids = compatibleLayers(state)
    const resolved = await buildLayers(ids)
    const resolvedIds = new Set(resolved.map((l) => l.id))
    unavailable.clear()
    for (const id of ids) if (!resolvedIds.has(id)) unavailable.add(id)
    if (!handle) {
      handle = createMap(mapEl, { view: state.view, layers: resolved })
    } else {
      if (rebuildView) handle.setView(state.view)
      handle.setLayers(resolved)
    }
    writeHash(state)
    refreshControls()
  }

  async function setView(view: ViewId): Promise<void> {
    state = { ...state, view }
    await apply(true)
  }

  function toggleLayer(id: string, on: boolean): void {
    const set = new Set(state.layers)
    if (on) set.add(id)
    else set.delete(id)
    state = { ...state, layers: LAYER_LIST.filter((d) => set.has(d.id)).map((d) => d.id) }
    void apply(false)
  }

  window.addEventListener('hashchange', () => {
    state = parseHash()
    void apply(true)
  })

  refreshControls()
  await apply(true)
}
