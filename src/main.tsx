import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { completeLoginIfCallback } from './domain/lichessAuth';
import { applyStoredTheme } from './domain/theme';
import './styles/index.css';

applyStoredTheme();

// Strips any OAuth callback params synchronously (before the router reads
// the URL); the token exchange itself finishes in the background and the
// account store notifies subscribers.
void completeLoginIfCallback();

const router = createRouter({
  routeTree,
  // Matches Vite's `base` so routes resolve under a subpath (GitHub Pages).
  basepath: import.meta.env.BASE_URL,
  defaultNotFoundComponent: () => (
    <main className="mx-auto max-w-260 px-10 pt-24 text-center">
      <p className="text-[40px] font-extrabold tracking-tight text-on-ink">404</p>
      <p className="mt-2 text-on-body">Cette page n'existe pas.</p>
      <a
        href={import.meta.env.BASE_URL}
        className="mt-4 inline-block font-semibold text-accent-ground"
      >
        ← Retour aux ouvertures
      </a>
    </main>
  ),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
