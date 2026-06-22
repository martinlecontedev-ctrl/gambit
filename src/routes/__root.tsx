import { createRootRoute, Link, Outlet, useLocation } from '@tanstack/react-router';

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
  const { pathname } = useLocation();
  // OUVERTURES covers home + editor + review; GUIDE only the guide route.
  const onGuide = pathname.startsWith('/guide');

  return (
    <div className="min-h-screen bg-paper text-ink antialiased">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur-md backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-310 items-center justify-between px-10">
          <Link to="/" className="flex items-center gap-2.5">
            <span
              className="inline-block h-4.5 w-4.5 rounded-md"
              style={{
                background: 'var(--accent-grad)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.35), 0 1px 2px rgba(40,40,30,.28)',
              }}
            />
            <span className="text-xl font-extrabold tracking-tight">Gambit</span>
          </Link>
          <nav className="flex items-center gap-7 text-[12.5px] font-bold tracking-[0.14em]">
            <Link
              to="/"
              className={`transition-colors hover:text-ink ${onGuide ? 'text-ink-muted' : 'text-ink'}`}
            >
              OUVERTURES
            </Link>
            <Link
              to="/guide"
              className={`transition-colors hover:text-ink ${onGuide ? 'text-ink' : 'text-ink-muted'}`}
            >
              GUIDE
            </Link>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
