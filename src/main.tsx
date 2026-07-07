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

const router = createRouter({ routeTree });

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
