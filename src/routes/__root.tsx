import { createRootRoute, Link, Outlet, useLocation } from '@tanstack/react-router';
import { UserMenu } from '../components/UserMenu';
import { useCommon } from '../i18n/common';

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
  const { pathname } = useLocation();
  const tr = useCommon();
  // OUVERTURES covers home + editor + review; the other tabs own their route.
  const active = pathname.startsWith('/guide')
    ? 'guide'
    : pathname.startsWith('/lichess')
      ? 'lichess'
      : 'openings';

  return (
    <div className="app-ground min-h-screen antialiased">
      <header className="sticky top-0 z-30 border-b border-header-line bg-header backdrop-blur-md backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-310 items-center justify-between px-4 sm:px-6 lg:px-10">
          <Link to="/" className="flex items-center gap-2.5">
            <span
              className="inline-block h-4.5 w-4.5 rounded-md"
              style={{
                background: 'var(--accent-grad)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.35), 0 1px 2px rgba(40,40,30,.28)',
              }}
            />
            <span className="text-xl font-extrabold tracking-tight text-on-ink">Gambit</span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-5 lg:gap-7">
            <nav className="flex items-center gap-3.5 text-[11px] tracking-widest sm:gap-6 sm:text-[12.5px] sm:tracking-[0.14em] font-bold">
              <Link
                to="/"
                className={`transition-colors hover:text-on-ink ${active === 'openings' ? 'text-on-ink' : 'text-on-idle'}`}
              >
                {tr.nav.openings}
              </Link>
              <Link
                to="/lichess"
                className={`transition-colors hover:text-on-ink ${active === 'lichess' ? 'text-on-ink' : 'text-on-idle'}`}
              >
                {tr.nav.lichess}
              </Link>
              <Link
                to="/guide"
                className={`transition-colors hover:text-on-ink ${active === 'guide' ? 'text-on-ink' : 'text-on-idle'}`}
              >
                {tr.nav.guide}
              </Link>
            </nav>
            <UserMenu />
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
