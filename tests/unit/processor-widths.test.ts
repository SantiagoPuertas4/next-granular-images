import { describe, expect, it } from 'vitest';
import { computeTargetWidths } from '../../src/cli/core/processor';

describe('computeTargetWidths', () => {
  it('never upscales and returns ascending widths', () => {
    expect(
      computeTargetWidths({ deviceSizes: [100, 200, 400], imageSizes: [16, 32] }, 250)
    ).toEqual([16, 32, 100, 200]);
    expect(computeTargetWidths({ deviceSizes: [100], imageSizes: [16] }, 10)).toEqual([]);
  });

  it('includes a configured size equal to the source width (R3-004)', () => {
    expect(computeTargetWidths({ deviceSizes: [100, 200], imageSizes: [16] }, 200)).toEqual([
      16, 100, 200,
    ]);
    expect(computeTargetWidths({ deviceSizes: [100], imageSizes: [16] }, 16)).toEqual([16]);
  });

  it('U32 dedupes widths shared by deviceSizes and imageSizes (#6)', () => {
    expect(computeTargetWidths({ deviceSizes: [16, 100], imageSizes: [16, 32] }, 150)).toEqual([
      16, 32, 100,
    ]);
  });
});
