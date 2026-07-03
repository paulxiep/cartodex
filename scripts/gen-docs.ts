// Generate docs/DATA_SOURCES.md from the dataset catalog: the catalog is the single source
// of truth for what data ships and under what licence, so the ledger never drifts from the
// registry. Run: `pnpm gen-docs` (also run in CI/pre-release to keep the doc fresh).

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DATASET_LIST, DOMAIN_ORDER, DOMAIN_LABELS } from '../src/app/catalog'
import type { DomainId } from '../src/app/catalog'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'docs', 'DATA_SOURCES.md')

function esc(s: string): string {
  return s.replace(/\|/g, '\\|')
}

function table(domain: DomainId): string {
  const rows = DATASET_LIST.filter((d) => d.domain === domain)
  if (rows.length === 0) return ''
  const head = '| Dataset | Kind | Provider | Licence |\n|---|---|---|---|'
  const body = rows
    .map((d) => `| ${esc(d.label)} | \`${d.kind}\` | ${esc(d.provider)} | ${esc(d.license)} |`)
    .join('\n')
  return `### ${DOMAIN_LABELS[domain]}\n\n${head}\n${body}\n`
}

const sections = DOMAIN_ORDER.map(table).filter(Boolean).join('\n')

const md = `# Cartodex — Data Sources

> Generated from the dataset catalog (\`src/app/catalog.ts\`) by \`pnpm gen-docs\`. Do not edit
> by hand; edit the catalog and regenerate. Every baked snapshot is an open-licensed source,
> normalised and re-hosted; the in-app attribution string carries the same credit.

${DATASET_LIST.length} datasets across ${new Set(DATASET_LIST.map((d) => d.domain)).size} domains.

${sections}
`

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, md)
console.log(`wrote ${OUT} (${DATASET_LIST.length} datasets)`)
