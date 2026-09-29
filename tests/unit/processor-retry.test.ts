import { describe, expect, it, vi } from 'vitest';
import { encodeWithRetry } from '../../src/cli/core/processor';

const bytes = (size: number) => Buffer.alloc(size);
const encoder = (sizes: Record<number, number>) =>
  vi.fn(async (quality?: number) => bytes(sizes[quality ?? 0]));

describe('encodeWithRetry', () => {
  it('U40 keeps the first pass when it is within the growth tolerance', async () => {
    const encode = encoder({ 90: 104 });
    expect((await encodeWithRetry(encode, 100, [90, 75])).length).toBe(104);
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it('U41 keeps the retry when it is smaller than a first pass that grew too much', async () => {
    const encode = encoder({ 90: 150, 75: 120 });
    expect((await encodeWithRetry(encode, 100, [90, 75])).length).toBe(120);
    expect(encode.mock.calls.map(([q]) => q)).toEqual([90, 75]);
  });

  it('U42 keeps the first pass when the retry comes out larger', async () => {
    const encode = encoder({ 90: 150, 75: 170 });
    expect((await encodeWithRetry(encode, 100, [90, 75])).length).toBe(150);
    expect(encode).toHaveBeenCalledTimes(2);
  });

  it('U43 encodes lossless output once, whatever its size', async () => {
    const encode = encoder({ 0: 500 });
    expect((await encodeWithRetry(encode, 100)).length).toBe(500);
    expect(encode).toHaveBeenCalledWith(undefined);
    expect(encode).toHaveBeenCalledTimes(1);
  });
});
