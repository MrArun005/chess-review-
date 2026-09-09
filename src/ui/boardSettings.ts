import { useSyncExternalStore } from 'react';

/**
 * Board appearance settings (theme + coordinates), shared across every board in
 * the app via a tiny external store and persisted to localStorage. Using a store
 * (rather than prop-drilling) means the review board, Play, the analysis board
 * and the puzzle trainer all pick up a change at once.
 */

export type ThemeKey =
  | 'green' | 'wood' | 'blue' | 'slate' | 'venom' | 'asgard'
  | 'ironman' | 'hulk' | 'captain' | 'panther' | 'ice' | 'coral' | 'purple' | 'tournament';

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
  // Iron Man — hot-rod red + gold.
  ironman: { name: 'Iron Man', light: '#e9c86b', dark: '#9b1c22' },
  // Hulk — gamma green + purple shorts.
  hulk: { name: 'Hulk', light: '#c9e39a', dark: '#5a3c7a' },
  // Captain America — shield blue + a red-tinted light square.
  captain: { name: 'Captain', light: '#e6d8d8', dark: '#2f4f9a' },
  // Black Panther — vibranium purple on charcoal (kept mid-tone for piece contrast).
  panther: { name: 'Panther', light: '#c9c3d8', dark: '#4a3d6b' },
  ice: { name: 'Ice', light: '#eef5fb', dark: '#7fa7c4' },
  coral: { name: 'Coral', light: '#fbe9dd', dark: '#d97b66' },
  purple: { name: 'Purple', light: '#e9e1f2', dark: '#8c6bb1' },
  tournament: { name: 'Classic', light: '#f0dcb4', dark: '#a0764a' },
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
