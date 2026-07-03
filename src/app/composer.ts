// The composer: pick a View, then bind datasets into display Channels, and the engine
// recomposes. Each channel is a slot: single-occupancy channels (choropleth, area, bubble)
// are a dropdown (one dataset or none — a second choice replaces the first); multi-occupancy
// channels (markers, arcs) are a checklist; base is a structural on/off. Channels the active
// view cannot render (e.g. area off an equal-area base) are disabled via compatible(). State
// lives in the URL hash so any combination is shareable/deep-linkable.

import { createMap, getView, compatible, VIEW_LIST, CHANNEL_LIST } from '../engine'
import type { Channel, MapHandle, ViewId } from '../engine'
import { buildLayers, bindingKey, attributionsFor } from './layers'
import type { Binding } from './layers'
import { DATASETS, datasetsOfKind, DOMAIN_ORDER, DOMAIN_LABELS } from './catalog'
import type { Dataset } from './catalog'
import { PRESETS } from './presets'
import { parseHash, toHash } from './state'
import type { State } from './state'

const DEFAULT: State = { view: PRESETS[0]!.view, bindings: PRESETS[0]!.bindings }

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
  // multi
  const rows = byDomain(datasets)
    .map(
      (g) =>
        g.datasets
          .map(
            (d) =>
              `<label class="channel-row"><input type="checkbox" data-role="multi" value="${d.id}" /> <span>${esc(d.label)}</span></label>`,
          )
          .join(''),
    )
    .join('')
  return `
    <div class="channel-slot" data-channel="${ch.id}">
      <label class="channel-head">${esc(ch.label)}</label>
      <div class="channel-multi">${rows}</div>
    </div>`
}

export async function mountComposer(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    <aside class="panel">
      <a class="back" href="${import.meta.env.BASE_URL}">← gallery</a>
      <h1>Cartodex</h1>
      <section><h2>View</h2><div class="views" id="views"></div></section>
      <section><h2>Channels</h2><div class="channels" id="channels">
        ${CHANNEL_LIST.map(channelSlotHtml).join('')}
      </div></section>
    </aside>
    <main class="stage">
      <div id="map" class="map"></div>
      <div id="loading" class="loading" hidden>Loading…</div>
      <footer id="attribution" class="attribution"></footer>
    </main>`

  const mapEl = root.querySelector<HTMLDivElement>('#map')!
  const viewsEl = root.querySelector<HTMLDivElement>('#views')!
  const channelsEl = root.querySelector<HTMLDivElement>('#channels')!
  const loadingEl = root.querySelector<HTMLDivElement>('#loading')!
  const attrEl = root.querySelector<HTMLElement>('#attribution')!

  let state = parseHash(location.hash, DEFAULT)
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

  function toggleMulti(channel: Channel['id'], dataset: string, on: boolean): void {
    let bindings = state.bindings.filter((b) => !(b.channel === channel && b.dataset === dataset))
    if (on) bindings = [...bindings, { channel, dataset }]
    state = { ...state, bindings }
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
    const { layers, failed } = await buildLayers(active)
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
    const attrs = attributionsFor(renderable().filter((b) => DATASETS[b.dataset] || b.channel === 'base'))
    attrEl.textContent = attrs.length ? attrs.join('  ·  ') : ''
  }

  window.addEventListener('hashchange', () => {
    state = parseHash(location.hash, DEFAULT)
    void apply(true)
  })

  refreshControls()
  await apply(true)
}
