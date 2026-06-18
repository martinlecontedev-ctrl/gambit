import { createRootRoute, Link, Outlet } from '@tanstack/react-router';

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <header className="border-b border-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Gambit
          </Link>
          <nav className="flex items-center gap-5 text-xs uppercase tracking-widest text-zinc-500">
            <Link to="/" className="hover:text-zinc-200" activeProps={{ className: 'text-zinc-200' }}>
              Ouvertures
            </Link>
            <Link to="/guide" className="hover:text-zinc-200" activeProps={{ className: 'text-zinc-200' }}>
              Guide
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
