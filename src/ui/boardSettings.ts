import { useSyncExternalStore } from 'react';

/**
 * Board appearance settings (theme + coordinates), shared across every board in
 * the app via a tiny external store and persisted to localStorage. Using a store
 * (rather than prop-drilling) means the review board, Play, the analysis board
 * and the puzzle trainer all pick up a change at once.
 */

export type ThemeKey = 'green' | 'wood' | 'blue' | 'slate' | 'venom' | 'asgard';

export interface Theme {
  name: string;
  light: string;
  dark: string;
}

export const THEMES: Record<ThemeKey, Theme> = {
  green: { name: 'Green', light: '#eeeed2', dark: '#769656' },
  wood: { name: 'Wood', light: '#f0d9b5', dark: '#b58863' },
  blue: { name: 'Blue', light: '#dee3e6', dark: '#8ca2ad' },
  slate: { name: 'Slate', light: '#dcdcd4', dark: '#5f6b7a' },
  // Venom / Spider-Man — web silver + spider red.
  venom: { name: 'Venom', light: '#d8cfd6', dark: '#7d1f2b' },
  // Thor / Asgard — Asgardian gold + royal blue.
  asgard: { name: 'Asgard', light: '#e8cf78', dark: '#274a86' },
};

export interface BoardSettings {
  theme: ThemeKey;
  coords: boolean;
}

const KEY = 'cr-board';

function load(): BoardSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<BoardSettings>;
      return {
        theme: p.theme && THEMES[p.theme] ? p.theme : 'green',
        coords: p.coords !== false,
      };
    }
  } catch {
    /* ignore */
  }
  return { theme: 'green', coords: true };
}

let state: BoardSettings = load();
const listeners = new Set<() => void>();

export function setBoardSettings(patch: Partial<BoardSettings>): void {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useBoardSettings(): BoardSettings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state
  );
}
