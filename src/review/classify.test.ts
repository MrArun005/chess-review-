import { describe, it, expect } from 'vitest';
import { classify, isGood } from './classify';

describe('classify', () => {
  it('maps win% drop to the right band', () => {
    expect(classify(-1)).toBe('best');
    expect(classify(0)).toBe('best');
    expect(classify(1)).toBe('excellent');
    expect(classify(3)).toBe('good');
    expect(classify(7)).toBe('inaccuracy');
    expect(classify(15)).toBe('mistake');
    expect(classify(40)).toBe('blunder');
  });

  it('has monotone severity at the boundaries', () => {
    expect(classify(1.99)).toBe('excellent');
    expect(classify(2)).toBe('good');
    expect(classify(4.99)).toBe('good');
    expect(classify(5)).toBe('inaccuracy');
    expect(classify(9.99)).toBe('inaccuracy');
    expect(classify(10)).toBe('mistake');
    expect(classify(19.99)).toBe('mistake');
    expect(classify(20)).toBe('blunder');
  });

  it('knows which classes are good', () => {
    expect(isGood('best')).toBe(true);
    expect(isGood('book')).toBe(true);
    expect(isGood('blunder')).toBe(false);
    expect(isGood('miss')).toBe(false);
  });
});
