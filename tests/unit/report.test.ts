import { describe, expect, it } from 'vitest';
import { pickClosestWidth, pickServedVariant, summarizeSavings } from '../../src/cli/core/report';

describe('pickClosestWidth', () => {
  it.each([
    [150, 100],
    [310, 400],
    [1000, 400],
    [10, 100],
  ])('U33 picks the closest width to %i (ties go lower)', (target, expected) => {
    expect(pickClosestWidth([400, 100, 200], target)).toBe(expected);
  });
});

describe('pickServedVariant (#15)', () => {
  const avif = { 100: 'a-100.avif', 400: 'a-400.avif' };
  const webp = { 100: 'a-100.webp', 400: 'a-400.webp' };

  it('reports the AVIF variant when there is one, since browsers pick it first', () => {
    expect(pickServedVariant({ avif, webp }, 350)).toBe('a-400.avif');
  });

  it('falls back to WebP, then to nothing', () => {
    expect(pickServedVariant({ avif: {}, webp }, 120)).toBe('a-100.webp');
    expect(pickServedVariant({ avif: {}, webp: {} }, 120)).toBeUndefined();
  });
});

describe('summarizeSavings', () => {
  it('U34 formats sizes in MB and the saved percentage', () => {
    const MB = 1024 * 1024;
    expect(
      summarizeSavings({
        sm: { original: 0, optimized: 0 },
        md: { original: 2 * MB, optimized: MB },
        lg: { original: 3 * MB, optimized: 1234567 },
      })
    ).toEqual({
      sm: { Original: '0.00 MB', Optimized: '0.00 MB', Saved: '0.00 MB', '%': '0%' },
      md: { Original: '2.00 MB', Optimized: '1.00 MB', Saved: '1.00 MB', '%': '50.0%' },
      lg: { Original: '3.00 MB', Optimized: '1.18 MB', Saved: '1.82 MB', '%': '60.8%' },
    });
  });
});
