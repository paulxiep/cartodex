import { defineConfig } from 'vite'

// Cartodex ships two HTML entry points:
//   index.html   - the gallery / "codex" of preset (view x layers) combos
//   compose.html - the composer (view picker + layer toggles), deep-linked via the URL hash
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
      },
    },
  },
})
