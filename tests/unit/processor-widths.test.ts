import { describe, expect, it } from 'vitest';
import { computeTargetWidths } from '../../src/cli/core/processor';

describe('computeTargetWidths', () => {
  it('never upscales and returns ascending widths', () => {
    expect(
      computeTargetWidths({ deviceSizes: [100, 200, 400], imageSizes: [16, 32] }, 250)
    ).toEqual([16, 32, 100, 200]);
    expect(computeTargetWidths({ deviceSizes: [100], imageSizes: [16] }, 10)).toEqual([]);
  });
});
