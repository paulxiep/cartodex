// Changelog page: renders CHANGELOG.md (the same file the version badge reads) as HTML, with
// navigation back to the gallery and the composer. A tiny line-based renderer covers the small
// markdown subset the changelog uses (headings, lists, blockquotes, paragraphs, inline links) -
// no markdown dependency for one static page.

import { CHANGELOG_MD } from './version'

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

// Inline: escape, then linkify [text](url).
const inline = (s: string): string =>
  esc(s).replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t: string, u: string) => `<a href="${u}">${t}</a>`)

function renderMarkdown(md: string): string {
  const out: string[] = []
  let para: string[] = []
  let li: string[] | null = null // buffer for the current list item (folds wrapped lines)
  let inList = false
  const flushPara = (): void => {
    if (para.length) {
      out.push(`<p>${inline(para.join(' '))}</p>`)
      para = []
    }
  }
  const flushLi = (): void => {
    if (li) {
      out.push(`<li>${inline(li.join(' '))}</li>`)
      li = null
    }
  }
  const closeList = (): void => {
    flushLi()
    if (inList) {
      out.push('</ul>')
      inList = false
    }
  }
  const block = (): void => {
    flushPara()
    closeList()
  }
  for (const line of md.split('\n')) {
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) {
      block()
      const level = h[1]!.length
      out.push(`<h${level}>${inline(h[2]!)}</h${level}>`)
    } else if (/^[-*]\s+/.test(line)) {
      flushPara()
      flushLi()
      if (!inList) {
        out.push('<ul>')
        inList = true
      }
      li = [line.replace(/^[-*]\s+/, '')]
    } else if (/^>\s?/.test(line)) {
      block()
      out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`)
    } else if (line.trim() === '') {
      block()
    } else if (inList && li) {
      li.push(line.trim()) // a wrapped continuation of the current bullet
    } else {
      closeList()
      para.push(line.trim())
    }
  }
  block()
  return out.join('\n')
}

export function mountChangelog(root: HTMLElement): void {
  const base = import.meta.env.BASE_URL
  root.innerHTML = `
    <nav class="cl-nav">
      <a href="${base}">← Gallery</a>
      <a href="${base}compose.html">Composer →</a>
    </nav>
    <article class="changelog">${renderMarkdown(CHANGELOG_MD)}</article>`
}
