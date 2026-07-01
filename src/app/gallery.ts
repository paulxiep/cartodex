// The gallery / "codex": a grid of preset (view × layers) cards, each deep-linking
// into the composer. Adding a showcase is a new entry in presets.ts.

import { getView } from '../engine'
import { LAYERS } from './layers'
import { PRESETS, presetHash } from './presets'
import type { Preset } from './presets'

function cell(p: Preset): string {
  const href = `${import.meta.env.BASE_URL}compose.html${presetHash(p)}`
  const view = getView(p.view).label
  const layers = p.layers.map((id) => LAYERS[id]?.label ?? id).join(' · ')
  return `
    <a class="card" href="${href}">
      <div class="card-body">
        <h3>${p.label}</h3>
        <p>${p.description}</p>
      </div>
      <div class="card-meta">
        <span class="tag view">${view}</span>
        <span class="tag layers">${layers}</span>
      </div>
    </a>`
}

export function mountGallery(root: HTMLElement): void {
  root.innerHTML = `
    <header class="hero">
      <h1>Cartodex</h1>
      <p>A composable codex of maps - pick a <strong>view</strong>, toggle <strong>layers</strong>, and they combine.</p>
      <a class="cta" href="${import.meta.env.BASE_URL}compose.html">Open the composer →</a>
    </header>
    <section class="grid">
      ${PRESETS.map(cell).join('')}
    </section>`
}
