import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { completeLoginIfCallback } from './domain/lichessAuth';
import { applyStoredTheme } from './domain/theme';
import { applyStoredLang } from './i18n';
import { useCommon } from './i18n/common';
import './styles/index.css';

applyStoredTheme();
applyStoredLang();

// Strips any OAuth callback params synchronously (before the router reads
// the URL); the token exchange itself finishes in the background and the
// account store notifies subscribers.
void completeLoginIfCallback();

function NotFound() {
  const tr = useCommon();
  return (
    <main className="mx-auto max-w-260 px-10 pt-24 text-center">
      <p className="text-[40px] font-extrabold tracking-tight text-on-ink">404</p>
      <p className="mt-2 text-on-body">{tr.notFound.body}</p>
      <a
        href={import.meta.env.BASE_URL}
        className="mt-4 inline-block font-semibold text-accent-ground"
      >
        {tr.notFound.back}
      </a>
    </main>
  );
}

const router = createRouter({
  routeTree,
  // Matches Vite's `base` so routes resolve under a subpath (GitHub Pages).
  basepath: import.meta.env.BASE_URL,
  defaultNotFoundComponent: NotFound,
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
