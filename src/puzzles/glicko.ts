/**
 * Glicko-2 (Glickman, "Example of the Glicko-2 system", 2013). Each solved or
 * failed puzzle is one game against an opponent rated at the puzzle's rating.
 * RD is floored so the rating keeps responding after hundreds of puzzles
 * instead of freezing — a puzzle trainer should feel your improvement.
 */

export interface Glicko {
  rating: number;
  rd: number;
  vol: number;
}

export interface Opponent {
  rating: number;
  rd: number;
  /** 1 win, 0 loss, 0.5 draw. */
  score: number;
}

const SCALE = 173.7178;
export const TAU = 0.5;
export const RD_MIN = 50;
export const RD_MAX = 350;
export const START: Glicko = { rating: 1500, rd: 350, vol: 0.06 };

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expect = (mu: number, muJ: number, phiJ: number) => 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/** One rating period against `games`. Pure; no RD floor (see `rate`). */
export function update(p: Glicko, games: Opponent[], tau = TAU): Glicko {
  const mu = (p.rating - 1500) / SCALE;
  const phi = p.rd / SCALE;
  if (games.length === 0) {
    return { rating: p.rating, rd: Math.sqrt(phi * phi + p.vol * p.vol) * SCALE, vol: p.vol };
  }
  let vInv = 0;
  let sum = 0;
  for (const o of games) {
    const muJ = (o.rating - 1500) / SCALE;
    const phiJ = o.rd / SCALE;
    const e = expect(mu, muJ, phiJ);
    const gj = g(phiJ);
    vInv += gj * gj * e * (1 - e);
    sum += gj * (o.score - e);
  }
  const v = 1 / vInv;
  const delta = v * sum;

  // Volatility: Illinois-method root find of f(x) = 0.
  const a = Math.log(p.vol * p.vol);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const d = phi * phi + v + ex;
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * d * d) - (x - a) / (tau * tau);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else fA /= 2;
    B = C;
    fB = fC;
  }
  const vol = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + vol * vol);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * sum;
  return { rating: muNew * SCALE + 1500, rd: phiNew * SCALE, vol };
}

/** Rate a single puzzle attempt, clamping RD and volatility to sane bounds. */
export function rate(p: Glicko, puzzleRating: number, win: boolean, puzzleRd = 80): Glicko {
  const n = update(p, [{ rating: puzzleRating, rd: puzzleRd, score: win ? 1 : 0 }]);
  return {
    rating: n.rating,
    rd: Math.min(RD_MAX, Math.max(RD_MIN, n.rd)),
    vol: Math.min(0.1, Math.max(0.03, n.vol)),
  };
}
