import rulesData from './rules.json';
import { render, pickPhrasing } from './templates';
import type { Facts } from './facts';

type Comparator = { lt?: number; lte?: number; gt?: number; gte?: number; eq?: number };

interface When {
  bestIsMate?: boolean;
  playedIsMate?: boolean;
  refutationIsCapture?: boolean;
  opponentMotif?: string;
  materialSwing?: Comparator;
  drop?: Comparator;
}

interface Rule {
  id: string;
  priority: number;
  category: string;
  when: When;
  say: string[];
}

const RULES: Rule[] = (rulesData as Rule[])
  .slice()
  .sort((a, b) => b.priority - a.priority);

export interface Explanation {
  ruleId: string;
  category: string;
  text: string;
}

/**
 * Match facts against the rule DSL and render explanations.
 *
 * Rules are sorted by priority. The first matching rule per category wins, and
 * we fire at most `limit` explanations total (default 2) so the panel stays
 * terse.
 */
export function explain(facts: Facts, fenBefore: string, limit = 2): Explanation[] {
  const out: Explanation[] = [];
  const usedCategories = new Set<string>();

  for (const rule of RULES) {
    if (out.length >= limit) break;
    if (usedCategories.has(rule.category)) continue;
    if (!matches(rule.when, facts)) continue;

    usedCategories.add(rule.category);
    out.push({
      ruleId: rule.id,
      category: rule.category,
      text: render(pickPhrasing(rule.say, fenBefore), facts),
    });
  }

  return out;
}

function matches(when: When, f: Facts): boolean {
  if (when.bestIsMate !== undefined && when.bestIsMate !== f.bestIsMate) return false;
  if (when.playedIsMate !== undefined && when.playedIsMate !== f.playedIsMate) return false;
  if (
    when.refutationIsCapture !== undefined &&
    when.refutationIsCapture !== f.refutationIsCapture
  )
    return false;
  if (when.opponentMotif !== undefined && when.opponentMotif !== f.opponentMotif)
    return false;
  if (when.materialSwing && !cmp(f.materialSwing, when.materialSwing)) return false;
  if (when.drop && !cmp(f.drop, when.drop)) return false;
  return true;
}

function cmp(value: number, c: Comparator): boolean {
  if (c.lt !== undefined && !(value < c.lt)) return false;
  if (c.lte !== undefined && !(value <= c.lte)) return false;
  if (c.gt !== undefined && !(value > c.gt)) return false;
  if (c.gte !== undefined && !(value >= c.gte)) return false;
  if (c.eq !== undefined && value !== c.eq) return false;
  return true;
}
