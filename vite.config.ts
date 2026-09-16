import { defineConfig } from 'vite'

// Cartodex ships three HTML entry points:
//   index.html     - the gallery / "codex" of preset (view x layers) combos
//   compose.html   - the composer (view picker + layer toggles), deep-linked via the URL hash
//   changelog.html - the changelog, rendered from CHANGELOG.md
// Relative base ('./') keeps assets working at any host root (Cloudflare Pages custom domain).
export default defineConfig({
  base: './',
  // host: true so the container's dev server is reachable from the host browser.
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: 'index.html',
        compose: 'compose.html',
        changelog: 'changelog.html',
      },
      output: {
        // Split the heavy, cacheable code the composer/bench need into vendor chunks so the gallery
        // (index.html) entry ships neither: `d3` (d3-* + topojson-client) and `engine` (src/engine/*).
        // views/meta.ts is pure view metadata the gallery imports, so it must NOT fall into `engine`.
        manualChunks(id: string) {
          const p = id.replace(/\\/g, '/')
          // views/meta.ts is pure view labels the gallery imports; no engine module imports it, so
          // leaving it unassigned lets it fold into the gallery/app chunk, not the engine chunk.
          if (p.includes('/src/engine/views/meta')) return
          if (p.includes('/src/engine/')) return 'engine'
          if (/\/node_modules\/(d3-|topojson-client)/.test(p)) return 'd3'
        },
      },
    },
  },
})
