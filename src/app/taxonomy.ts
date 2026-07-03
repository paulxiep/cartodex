// Taxonomy processor: a small, pure, reusable engine for hierarchical multi-select consistency.
// A `Taxonomy` is a parent -> children forest over dataset ids (e.g. lane traffic: All -> {Cargo,
// Non-cargo} -> leaves). It has no app knowledge; the composer feeds it the active taxonomy and a
// selection set. Datasets absent from the taxonomy are independent leaves and pass through flat.
//
// Invariant it maintains: a parent is selected exactly when ALL of its children are selected.
//   - selecting a node selects its whole subtree, then promotes any now-complete parent;
//   - deselecting a node deselects its subtree and every ancestor (an incomplete parent cannot
//     stay selected);
//   - normalizing an arbitrary set (e.g. from a deep-link) expands selected parents to their
//     subtree and promotes complete parents, so the rendered checkboxes are always consistent.

export type Taxonomy = Record<string, string[]> // parent id -> child ids

const childrenOf = (t: Taxonomy, id: string): string[] => t[id] ?? []

export function descendantsOf(t: Taxonomy, id: string): string[] {
  const out: string[] = []
  const stack = [...childrenOf(t, id)]
  while (stack.length) {
    const c = stack.pop()!
    out.push(c)
    stack.push(...childrenOf(t, c))
  }
  return out
}

export function ancestorsOf(t: Taxonomy, id: string): string[] {
  const out: string[] = []
  for (const [parent, kids] of Object.entries(t)) {
    if (kids.includes(id)) out.push(parent, ...ancestorsOf(t, parent))
  }
  return out
}

/** Promote every parent whose children are all selected (bubbles up multiple levels). */
function promote(t: Taxonomy, sel: Set<string>): void {
  let changed = true
  while (changed) {
    changed = false
    for (const [parent, kids] of Object.entries(t)) {
      if (!sel.has(parent) && kids.length > 0 && kids.every((c) => sel.has(c))) {
        sel.add(parent)
        changed = true
      }
    }
  }
}

/** Apply a single checkbox toggle and return the consistent selection set. */
export function applySelection(t: Taxonomy, selected: Iterable<string>, id: string, on: boolean): Set<string> {
  const sel = new Set(selected)
  if (on) {
    sel.add(id)
    for (const d of descendantsOf(t, id)) sel.add(d)
    promote(t, sel)
  } else {
    sel.delete(id)
    for (const d of descendantsOf(t, id)) sel.delete(d)
    for (const a of ancestorsOf(t, id)) sel.delete(a)
  }
  return sel
}

/** Make an arbitrary selection consistent: expand selected parents to their subtree, then promote. */
export function normalizeSelection(t: Taxonomy, ids: Iterable<string>): Set<string> {
  const sel = new Set(ids)
  for (const id of [...sel]) for (const d of descendantsOf(t, id)) sel.add(d)
  promote(t, sel)
  return sel
}

/** The top-most selected nodes: selected ids with no selected ancestor. Rendering merges only
 *  these, so a parent (Seaports total) subsumes its children instead of double-counting them. */
export function topmostSelected(t: Taxonomy, ids: Iterable<string>): string[] {
  const sel = new Set(ids)
  return [...sel].filter((id) => !ancestorsOf(t, id).some((a) => sel.has(a)))
}
