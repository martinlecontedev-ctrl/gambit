// Lichess OAuth2 PKCE flow for a backend-less SPA. Lichess supports public
// clients: no secret, any client_id, token exchange done from the browser
// (their /api/token endpoint is CORS-open for this exact use case).
// Docs: https://lichess.org/api#tag/OAuth
//
// No scope is requested: a bare token identifies the account (via
// /api/account) and satisfies the opening-explorer authorization.

const CLIENT_ID = 'gambit-openings-trainer';
const ACCOUNT_KEY = 'gambit.lichess.account';
const PKCE_KEY = 'gambit.lichess.pkce';

export type LichessAccount = {
  token: string;
  username: string;
};

// --- Tiny external store (same pattern as the repos) -----------------------

let cached: LichessAccount | null | undefined;
const listeners = new Set<() => void>();

export function subscribeAccount(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(): void {
  listeners.forEach(l => l());
}

export function getAccount(): LichessAccount | null {
  if (cached === undefined) {
    try {
      const raw = localStorage.getItem(ACCOUNT_KEY);
      cached = raw ? (JSON.parse(raw) as LichessAccount) : null;
    } catch {
      cached = null;
    }
  }
  return cached;
}

export function logout(): void {
  cached = null;
  try {
    localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    /* ignored */
  }
  notify();
}

function saveAccount(account: LichessAccount): void {
  cached = account;
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  } catch {
    /* ignored */
  }
  notify();
}

// --- PKCE helpers ------------------------------------------------------------

export function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/** OAuth redirects come back to the page the user left from (query/hash
 * stripped) — the exact same URI is replayed in the token exchange. */
function currentUri(): string {
  return `${location.origin}${location.pathname}`;
}

// --- Flow ---------------------------------------------------------------------

/** Kick off the PKCE dance: stores the verifier and navigates to Lichess. */
export async function login(): Promise<void> {
  const verifier = randomToken();
  const state = randomToken();
  const redirectUri = currentUri();
  try {
    sessionStorage.setItem(
      PKCE_KEY,
      JSON.stringify({ verifier, state, redirectUri }),
    );
  } catch {
    return; // no sessionStorage, no flow
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: await pkceChallenge(verifier),
    // study:write backs the repertoire push (private mirror studies); the
    // consent screen shows it. Everything else works with a bare token.
    scope: 'study:write',
    state,
  });
  location.href = `https://lichess.org/oauth?${params}`;
}

/**
 * Called once at app start: if the URL carries an OAuth callback
 * (`?code=…&state=…`), exchange the code for a token, resolve the username
 * and persist the account. The query params are stripped synchronously so
 * the router never sees them. Silently no-ops on any failure — the user can
 * just retry the login.
 */
export async function completeLoginIfCallback(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return;
  history.replaceState(null, '', location.pathname + location.hash);

  let stored: { verifier: string; state: string; redirectUri: string };
  try {
    const raw = sessionStorage.getItem(PKCE_KEY);
    if (!raw) return;
    sessionStorage.removeItem(PKCE_KEY);
    stored = JSON.parse(raw);
  } catch {
    return;
  }
  if (state !== stored.state) return;

  const tokenRes = await fetch('https://lichess.org/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: stored.verifier,
      redirect_uri: stored.redirectUri,
      client_id: CLIENT_ID,
    }),
  });
  if (!tokenRes.ok) return;
  const { access_token: token } = (await tokenRes.json()) as {
    access_token?: string;
  };
  if (!token) return;

  const accountRes = await fetch('https://lichess.org/api/account', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!accountRes.ok) return;
  const { username } = (await accountRes.json()) as { username?: string };
  if (!username) return;

  saveAccount({ token, username });
}
