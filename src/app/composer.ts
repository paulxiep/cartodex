// The composer: pick a View, then bind datasets into display Channels, and the engine
// recomposes. Each channel is a slot: single-occupancy channels (choropleth, area, bubble)
// are a dropdown (one dataset or none — a second choice replaces the first); multi-occupancy
// channels (markers, arcs) are a checklist; base is a structural on/off. Channels the active
// view cannot render (e.g. area off an equal-area base) are disabled via compatible(). State
// lives in the URL hash so any combination is shareable/deep-linkable.

import { createMap, getView, compatible, VIEW_LIST, CHANNEL_LIST } from '../engine'
import type { Channel, ChannelId, MapHandle, ViewId } from '../engine'
import { buildLayers, bindingKey, attributionsFor } from './layers'
import type { Binding } from './layers'
import { DATASETS, datasetsOfKind, DOMAIN_ORDER, DOMAIN_LABELS, LANE_TAXONOMY, PORT_TAXONOMY } from './catalog'
import type { Dataset } from './catalog'
import { applySelection, normalizeSelection } from './taxonomy'
import type { Taxonomy } from './taxonomy'
import { PRESETS } from './presets'
import { parseHash, toHash, defaultMonth } from './state'
import type { State } from './state'
import { VERSION } from './version'

const DEFAULT: State = { view: PRESETS[0]!.view, bindings: PRESETS[0]!.bindings, month: PRESETS[0]!.month ?? defaultMonth() }

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Channels whose multi-select is a hierarchy. The taxonomy processor (taxonomy.ts) does the work;
// the composer just supplies the right taxonomy per channel (empty → flat multi-select).
const CHANNEL_TAXONOMY: Partial<Record<ChannelId, Taxonomy>> = { lane: LANE_TAXONOMY, marker: PORT_TAXONOMY }
const taxonomyFor = (channel: ChannelId): Taxonomy => CHANNEL_TAXONOMY[channel] ?? {}

/** Make a parsed state consistent: normalize each taxonomy channel's selection (e.g. a deep-link
 *  with only a parent expands to its subtree). Non-taxonomy bindings (with scales) are untouched. */
function normalizeState(s: State): State {
  let bindings = s.bindings
  for (const channel of Object.keys(CHANNEL_TAXONOMY) as ChannelId[]) {
    const ids = bindings.filter((b) => b.channel === channel).map((b) => b.dataset)
    if (!ids.length) continue
    const norm = [...normalizeSelection(taxonomyFor(channel), ids)]
    bindings = [...bindings.filter((b) => b.channel !== channel), ...norm.map((dataset) => ({ channel, dataset }))]
  }
  return { ...s, bindings }
}

// Group a channel's candidate datasets by domain, in taxonomy order, for <optgroup>s.
function byDomain(datasets: Dataset[]): Array<{ label: string; datasets: Dataset[] }> {
  return DOMAIN_ORDER.map((d) => ({
    label: DOMAIN_LABELS[d],
    datasets: datasets.filter((ds) => ds.domain === d),
  })).filter((g) => g.datasets.length > 0)
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

// Static markup for one channel slot (options never change; only value/enabled/checked do).
function channelSlotHtml(ch: Channel): string {
  if (ch.capacity === 'structural') {
    return `
      <div class="channel-slot" data-channel="${ch.id}">
        <label class="channel-row"><input type="checkbox" data-role="base" /> <span>${esc(ch.label)}</span></label>
      </div>`
  }
  const datasets = ch.datasetKind ? datasetsOfKind(ch.datasetKind) : []
  if (ch.capacity === 'single') {
    const groups = byDomain(datasets)
      .map(
        (g) =>
          `<optgroup label="${esc(g.label)}">${g.datasets
            .map((d) => `<option value="${d.id}">${esc(d.label)}</option>`)
            .join('')}</optgroup>`,
      )
      .join('')
    return `
      <div class="channel-slot" data-channel="${ch.id}">
        <label class="channel-head">${esc(ch.label)}</label>
        <select data-role="single">
          <option value="">— none —</option>
          ${groups}
        </select>
      </div>`
  }
  // multi: render the channel's taxonomy as an indented tree - parents (Seaports, Cargo,
  // Non-cargo) with their children one level deeper; datasets outside the taxonomy are flat roots.
  // Selecting a node cascades through the taxonomy (wired in toggleMulti).
  const row = (d: Dataset, depth: number): string =>
    `<label class="channel-row" style="padding-left:${depth * 16}px"><input type="checkbox" data-role="multi" value="${d.id}" /> <span>${esc(d.label)}</span></label>`
  const tax = taxonomyFor(ch.id)
  const childIds = new Set(Object.values(tax).flat())
  const byId = new Map(datasets.map((d) => [d.id, d]))
  const done = new Set<string>()
  const parts: string[] = []
  const emit = (d: Dataset, depth: number): void => {
    if (done.has(d.id)) return
    done.add(d.id)
    parts.push(row(d, depth))
    for (const cid of tax[d.id] ?? []) {
      const c = byId.get(cid)
      if (c) emit(c, depth + 1)
    }
  }
  for (const d of datasets) if (!childIds.has(d.id)) emit(d, 0)
  for (const d of datasets) emit(d, 0) // any strays (shouldn't happen)
  return `
    <div class="channel-slot" data-channel="${ch.id}">
      <label class="channel-head">${esc(ch.label)}</label>
      <div class="channel-multi">${parts.join('')}</div>
    </div>`
}

export async function mountComposer(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    <aside class="panel">
      <a class="back" href="${import.meta.env.BASE_URL}">← gallery</a>
      <h1>Cartodex <a class="version" href="${import.meta.env.BASE_URL}changelog.html" title="Changelog">v${VERSION}</a></h1>
      <section><h2>View</h2><div class="views" id="views"></div></section>
      <section><h2>Channels</h2><div class="channels" id="channels">
        ${CHANNEL_LIST.map(channelSlotHtml).join('')}
      </div></section>
    </aside>
    <main class="stage">
      <div id="map" class="map"></div>
      <div id="month-control" class="month-control" hidden>
        <button type="button" data-role="month-prev" aria-label="Previous month">◄</button>
        <select data-role="month" aria-label="Month">
          ${MONTH_NAMES.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('')}
        </select>
        <button type="button" data-role="month-next" aria-label="Next month">►</button>
      </div>
      <div id="loading" class="loading" hidden>Loading…</div>
      <footer id="attribution" class="attribution"></footer>
    </main>`

  const mapEl = root.querySelector<HTMLDivElement>('#map')!
  const viewsEl = root.querySelector<HTMLDivElement>('#views')!
  const channelsEl = root.querySelector<HTMLDivElement>('#channels')!
  const loadingEl = root.querySelector<HTMLDivElement>('#loading')!
  const attrEl = root.querySelector<HTMLElement>('#attribution')!
  const monthEl = root.querySelector<HTMLDivElement>('#month-control')!
  const monthSel = monthEl.querySelector<HTMLSelectElement>('select[data-role="month"]')!

  let state = normalizeState(parseHash(location.hash, DEFAULT))
  let handle: MapHandle | null = null
  let applyToken = 0
  // Bindings whose dataset failed to load this render (snapshot missing / source down). The
  // selection stays so it recovers on retry, but the slot is flagged.
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

  // Wire channel-slot inputs to state mutations.
  for (const ch of CHANNEL_LIST) {
    const slot = channelsEl.querySelector<HTMLDivElement>(`.channel-slot[data-channel="${ch.id}"]`)!
    if (ch.capacity === 'structural') {
      slot.querySelector<HTMLInputElement>('input[data-role="base"]')!
        .addEventListener('change', (e) => setBase((e.target as HTMLInputElement).checked))
    } else if (ch.capacity === 'single') {
      slot.querySelector<HTMLSelectElement>('select[data-role="single"]')!
        .addEventListener('change', (e) => setSingle(ch.id, (e.target as HTMLSelectElement).value || null))
    } else {
      slot.querySelectorAll<HTMLInputElement>('input[data-role="multi"]').forEach((input) =>
        input.addEventListener('change', () => toggleMulti(ch.id, input.value, input.checked)),
      )
    }
  }

  // Global month control (temporal axis): winds/currents/SST are baked per month, and this picks
  // which loads. Only the shown month is fetched, so switching months lazy-loads one snapshot.
  monthSel.addEventListener('change', (e) => setMonth(Number((e.target as HTMLSelectElement).value)))
  monthEl.querySelector<HTMLButtonElement>('button[data-role="month-prev"]')!
    .addEventListener('click', () => setMonth(state.month - 1))
  monthEl.querySelector<HTMLButtonElement>('button[data-role="month-next"]')!
    .addEventListener('click', () => setMonth(state.month + 1))

  function setMonth(month: number): void {
    state = { ...state, month: ((month - 1 + 12) % 12) + 1 } // wrap Dec↔Jan
    void apply(false)
  }

  function othersOf(channel: string): Binding[] {
    return state.bindings.filter((b) => b.channel !== channel)
  }

  function setBase(on: boolean): void {
    const others = othersOf('base')
    state = { ...state, bindings: on ? [{ channel: 'base', dataset: 'land' }, ...others] : others }
    void apply(false)
  }

  function setSingle(channel: Channel['id'], dataset: string | null): void {
    const bindings = othersOf(channel)
    if (dataset) bindings.push({ channel, dataset })
    state = { ...state, bindings }
    void apply(false)
  }

  // Multi-select with taxonomy consistency: for a channel with a hierarchy (lanes), toggling a
  // node cascades to its subtree/ancestors via the taxonomy processor; other channels have an
  // empty taxonomy and toggle flat.
  function toggleMulti(channel: Channel['id'], dataset: string, on: boolean): void {
    const tax = taxonomyFor(channel)
    const current = state.bindings.filter((b) => b.channel === channel).map((b) => b.dataset)
    const sel = applySelection(tax, current, dataset, on)
    const others = state.bindings.filter((b) => b.channel !== channel)
    state = { ...state, bindings: [...others, ...[...sel].map((d) => ({ channel, dataset: d }))] }
    void apply(false)
  }

  // Bindings renderable under the active view (drops e.g. area on a non-equal-area view).
  function renderable(): Binding[] {
    const view = getView(state.view)
    return state.bindings.filter((b) => compatible(view, b.channel))
  }

  async function apply(rebuildView: boolean): Promise<void> {
    const token = ++applyToken
    const active = renderable()
    loadingEl.hidden = false
    const { layers, failed } = await buildLayers(active, state.month)
    if (token !== applyToken) return // a newer apply superseded this one
    loadingEl.hidden = true
    unavailable.clear()
    for (const k of failed) unavailable.add(k)
    if (!handle) handle = createMap(mapEl, { view: state.view, layers })
    else {
      if (rebuildView) handle.setView(state.view)
      handle.setLayers(layers)
    }
    history.replaceState(null, '', toHash(state))
    refreshControls()
  }

  async function setView(view: ViewId): Promise<void> {
    state = { ...state, view }
    await apply(true)
  }

  function refreshControls(): void {
    const view = getView(state.view)
    viewsEl.querySelectorAll<HTMLButtonElement>('.view-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset['view'] === state.view)
    })
    for (const ch of CHANNEL_LIST) {
      const slot = channelsEl.querySelector<HTMLDivElement>(`.channel-slot[data-channel="${ch.id}"]`)!
      const ok = compatible(view, ch.id)
      slot.classList.toggle('disabled', !ok)
      const mine = state.bindings.filter((b) => b.channel === ch.id)
      const failedHere = mine.some((b) => unavailable.has(bindingKey(b)))
      slot.classList.toggle('unavailable', failedHere)
      if (ch.capacity === 'structural') {
        const input = slot.querySelector<HTMLInputElement>('input[data-role="base"]')!
        input.disabled = !ok
        input.checked = mine.length > 0
      } else if (ch.capacity === 'single') {
        const sel = slot.querySelector<HTMLSelectElement>('select[data-role="single"]')!
        sel.disabled = !ok
        sel.value = mine[0]?.dataset ?? ''
      } else {
        const chosen = new Set(mine.map((b) => b.dataset))
        slot.querySelectorAll<HTMLInputElement>('input[data-role="multi"]').forEach((input) => {
          input.disabled = !ok
          input.checked = chosen.has(input.value)
        })
      }
    }
    // Month control appears only when a temporal layer (winds/currents/SST) is bound and renderable.
    const temporalActive = renderable().some((b) => DATASETS[b.dataset]?.temporal)
    monthEl.hidden = !temporalActive
    monthSel.value = String(state.month)

    const attrs = attributionsFor(renderable().filter((b) => DATASETS[b.dataset] || b.channel === 'base'))
    attrEl.textContent = attrs.length ? attrs.join('  ·  ') : ''
  }

  window.addEventListener('hashchange', () => {
    state = normalizeState(parseHash(location.hash, DEFAULT))
    void apply(true)
  })

  refreshControls()
  await apply(true)
}
