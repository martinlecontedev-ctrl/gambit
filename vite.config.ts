import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  // GitHub Pages serves the site under /<repo>/ — the deploy workflow sets
  // GITHUB_PAGES=1. Local dev/preview and any root-hosted deploy stay at '/'.
  // Consumers must build URLs from import.meta.env.BASE_URL, never from '/'.
  base: process.env.GITHUB_PAGES ? '/gambit/' : '/',
  plugins: [
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/stockfish/bin/stockfish-18-lite-single.{js,wasm}',
          dest: 'engine',
        },
      ],
    }),
  ],
});
