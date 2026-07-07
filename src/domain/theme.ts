import { useSyncExternalStore } from 'react';

export type ThemeId = 'clair-noyer' | 'miton-vertorange' | 'sombre-vertnuit';

export const DEFAULT_THEME: ThemeId = 'miton-vertorange';

/** Order = display order in the user panel. Preview colors are the theme's own
 * values (a swatch must show its theme regardless of the active one). Labels
 * and hints live in i18n/menu.ts — language, not theme data. */
export const THEMES: {
  id: ThemeId;
  preview: { ground: string; surface: string; accent: string; board: string };
}[] = [
  {
    id: 'clair-noyer',
    preview: { ground: '#f4f5ec', surface: '#fcfcf6', accent: '#457453', board: '#b0895a' },
  },
  {
    id: 'miton-vertorange',
    preview: { ground: '#3c6245', surface: '#f4efe1', accent: '#cf722d', board: '#688c50' },
  },
  {
    id: 'sombre-vertnuit',
    preview: { ground: '#182620', surface: '#26302a', accent: '#cf722d', board: '#688c50' },
  },
];

const KEY = 'gambit.theme';
const listeners = new Set<() => void>();

/** Stable identity so useSyncExternalStore doesn't resubscribe every render. */
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function isThemeId(v: string | null): v is ThemeId {
  return THEMES.some(t => t.id === v);
}

export function getTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    if (isThemeId(v)) return v;
  } catch {
    /* storage unavailable → default */
  }
  return DEFAULT_THEME;
}

export function setTheme(theme: ThemeId) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* still apply for the session */
  }
  document.documentElement.dataset.theme = theme;
  listeners.forEach(l => l());
}

/** Sync storage → DOM at startup (index.html applies it pre-hydration too,
 * so a non-default theme doesn't flash; this keeps both paths consistent). */
export function applyStoredTheme() {
  document.documentElement.dataset.theme = getTheme();
}

export function useTheme(): ThemeId {
  return useSyncExternalStore(subscribe, getTheme, getTheme);
}
