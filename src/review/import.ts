import { Chess } from 'chess.js';

export interface GameSummary {
  source: 'chess.com' | 'lichess' | 'pgn';
  white: string;
  black: string;
  whiteRating?: string;
  blackRating?: string;
  result: string; // "1-0", "0-1", "1/2-1/2"
  timeClass?: string;
  date?: string;
  url?: string;
  pgn: string;
}

/**
 * Fetch a player's most recent games from chess.com's public API (keyless,
 * CORS-open). Returns the newest archive's games, newest first.
 */
export async function fetchChessComGames(
  username: string,
  signal?: AbortSignal
): Promise<GameSummary[]> {
  const user = username.trim().toLowerCase();
  const archivesRes = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`,
    { signal }
  );
  if (!archivesRes.ok) {
    throw new Error(
      archivesRes.status === 404
        ? `No chess.com player named "${username}".`
        : `chess.com API error (${archivesRes.status}).`
    );
  }
  const { archives } = (await archivesRes.json()) as { archives: string[] };
  if (!archives?.length) return [];

  const latest = archives[archives.length - 1];
  const monthRes = await fetch(latest, { signal });
  if (!monthRes.ok) throw new Error(`chess.com API error (${monthRes.status}).`);
  const { games } = (await monthRes.json()) as { games: ChessComGame[] };

  return games
    .filter((g) => g.pgn)
    .reverse()
    .map((g) => ({
      source: 'chess.com' as const,
      white: g.white.username,
      black: g.black.username,
      whiteRating: String(g.white.rating ?? ''),
      blackRating: String(g.black.rating ?? ''),
      result: resultFrom(g.white.result, g.black.result),
      timeClass: g.time_class,
      date: g.end_time ? new Date(g.end_time * 1000).toISOString().slice(0, 10) : undefined,
      url: g.url,
      pgn: g.pgn,
    }));
}

/**
 * Fetch a player's most recent games from lichess (keyless). The API streams
 * PGN when asked; we split it into individual games.
 */
export async function fetchLichessGames(
  username: string,
  max = 20,
  signal?: AbortSignal
): Promise<GameSummary[]> {
  const user = username.trim();
  const res = await fetch(
    `https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${max}`,
    { headers: { Accept: 'application/x-chess-pgn' }, signal }
  );
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? `No lichess player named "${username}".`
        : `lichess API error (${res.status}).`
    );
  }
  const text = await res.text();
  return splitPgns(text).map((pgn) => summarize(pgn, 'lichess'));
}

/** Split a multi-game PGN blob into individual game strings. */
export function splitPgns(text: string): string[] {
  const games: string[] = [];
  const chunks = text.split(/\n\n(?=\[Event )/g);
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (trimmed.includes('[Event')) games.push(trimmed);
  }
  return games;
}

/** Build a summary by reading a PGN's headers. */
export function summarize(pgn: string, source: GameSummary['source']): GameSummary {
  const c = new Chess();
  let headers: Record<string, string> = {};
  try {
    c.loadPgn(pgn);
    headers = c.header() as Record<string, string>;
  } catch {
    /* keep empty headers on malformed PGN */
  }
  return {
    source,
    white: headers.White ?? 'White',
    black: headers.Black ?? 'Black',
    whiteRating: headers.WhiteElo,
    blackRating: headers.BlackElo,
    result: headers.Result ?? '*',
    date: headers.UTCDate ?? headers.Date,
    url: headers.Site,
    pgn,
  };
}

function resultFrom(white: string, black: string): string {
  if (white === 'win') return '1-0';
  if (black === 'win') return '0-1';
  if (isDraw(white) || isDraw(black)) return '1/2-1/2';
  return '*';
}

function isDraw(r: string): boolean {
  return ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(r);
}

interface ChessComGame {
  pgn: string;
  url: string;
  time_class: string;
  end_time: number;
  white: { username: string; rating: number; result: string };
  black: { username: string; rating: number; result: string };
}
