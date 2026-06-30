// A single shared tooltip element reused across maps. Kept dependency-free and
// pointer-events-none so it never blocks hover on the geometry beneath it.

let el: HTMLDivElement | null = null

function ensure(): HTMLDivElement {
  if (el) return el
  el = document.createElement('div')
  el.className = 'cartodex-tooltip'
  el.setAttribute('role', 'tooltip')
  Object.assign(el.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '1000',
    padding: '4px 8px',
    font: '12px/1.4 system-ui, sans-serif',
    background: 'rgba(20,22,26,0.94)',
    color: '#e8e8ea',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.12)',
    transform: 'translate(-50%, calc(-100% - 10px))',
    whiteSpace: 'nowrap',
    opacity: '0',
    transition: 'opacity 90ms ease',
  } satisfies Partial<CSSStyleDeclaration>)
  document.body.appendChild(el)
  return el
}

export function showTooltip(text: string, clientX: number, clientY: number): void {
  const t = ensure()
  t.textContent = text
  t.style.left = `${clientX}px`
  t.style.top = `${clientY}px`
  t.style.opacity = '1'
}

export function hideTooltip(): void {
  if (el) el.style.opacity = '0'
}
