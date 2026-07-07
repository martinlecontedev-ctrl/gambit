import { useSyncExternalStore } from 'react';

/**
 * Featherweight i18n. Each area of the app owns a namespace module under
 * src/i18n/ exporting `{ fr, en }` where `en: typeof fr` (key parity and
 * matching function signatures enforced by the compiler). Components pick
 * their block with `useStrings(NS)` — typed member access, no key strings,
 * plurals/interpolation as plain functions in the dictionary. Prose-heavy
 * namespaces may be .tsx files holding ReactNode values.
 */
export type Lang = 'fr' | 'en';

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'English' },
];

/** BCP 47 locales for Intl formatters. */
export const LOCALES: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB' };

const KEY = 'gambit.lang';
const listeners = new Set<() => void>();

/** Stable identity so useSyncExternalStore doesn't resubscribe every render. */
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function getLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'fr' || v === 'en') return v;
  } catch {
    /* storage unavailable → default */
  }
  return 'fr';
}

function apply(lang: Lang) {
  document.documentElement.lang = lang;
  document.title =
    lang === 'fr' ? 'Gambit — Apprenez vos ouvertures' : 'Gambit — Learn your openings';
}

export function setLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* still apply for the session */
  }
  apply(lang);
  listeners.forEach(l => l());
}

/** Sync storage → DOM at startup (main.tsx). */
export function applyStoredLang() {
  apply(getLang());
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/** Current language's block of a namespace dictionary; subscribes the
 * component to language switches. */
export function useStrings<T>(dict: Record<Lang, T>): T {
  return dict[useLang()];
}
