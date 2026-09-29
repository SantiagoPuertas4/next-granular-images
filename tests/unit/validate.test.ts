import { describe, expect, it } from 'vitest';
import { ConfigError, validateConfig } from '../../src/cli/core/validate';
import type { GranularImagesConfig } from '../../src/types/config';

type Input = Partial<GranularImagesConfig> | Record<string, unknown>;
const base = { qualities: { webp: 80 }, effort: { webp: 4 } } as const;
const validate = (config: Input) =>
  validateConfig(config as Partial<GranularImagesConfig>);

const catchConfigError = (config: Input): ConfigError => {
  try {
    validate(config);
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError);
    return err as ConfigError;
  }
  throw new Error('expected validateConfig to throw');
};

describe('validateConfig', () => {
  it('U1 fills every default around a minimal config', () => {
    const config = validate(base);
    expect(config.paths).toEqual({
      input: 'public',
      output: 'public/next-granular-images',
      types: 'src/generated/next-granular-images',
    });
    expect(config.blurSize).toBe(10);
    expect(config.blurQuality).toBe(50);
    expect(config.concurrency).toBe(4);
    expect(config.minSizeToOptimize).toBe(0);
    expect(config.exclusions).toEqual(['.ico', '.xml', '.webmanifest', '.svg', '.webp', '.avif']);
    expect(config.deviceSizes[0]).toBe(640);
    expect(config.breakpoints).toEqual({ sm: 640, md: 768, lg: 1024, xl: 1280 });
  });

  it('U2 rejects an empty config because no output format is enabled', () => {
    const err = catchConfigError({});
    expect(err.messages).toHaveLength(1);
    expect(err.messages[0]).toMatch(/qualities/);
  });

  it.each([
    ['qualities.avif', { qualities: { avif: 0 }, effort: { avif: 4 } }],
    ['qualities.avif', { qualities: { avif: 101 }, effort: { avif: 4 } }],
    ['qualities.webp', { qualities: { webp: 0 }, effort: { webp: 4 } }],
    ['qualities.webp', { qualities: { webp: 101 }, effort: { webp: 4 } }],
    ['effort.avif', { qualities: { avif: 50 }, effort: { avif: 0 } }],
    ['effort.avif', { qualities: { avif: 50 }, effort: { avif: 10 } }],
    ['effort.webp', { qualities: { webp: 50 }, effort: { webp: 0 } }],
    ['effort.webp', { qualities: { webp: 50 }, effort: { webp: 7 } }],
    ['blurSize', { ...base, blurSize: 3 }],
    ['blurSize', { ...base, blurSize: 65 }],
    ['blurQuality', { ...base, blurQuality: 0 }],
    ['blurQuality', { ...base, blurQuality: 101 }],
    ['minSizeToOptimize', { ...base, minSizeToOptimize: -1 }],
  ])('U3 rejects an out-of-range %s', (field, config) => {
    const err = catchConfigError(config);
    expect(err.messages).toHaveLength(1);
    expect(err.messages[0]).toContain(field);
  });

  it('U4 accepts the inclusive boundaries and keeps the values', () => {
    for (const q of [1, 100]) {
      const c = validate({ qualities: { avif: q, webp: q }, effort: { avif: 9, webp: 6 } });
      expect(c.qualities).toEqual({ avif: q, webp: q });
      expect(c.effort).toEqual({ avif: 9, webp: 6 });
    }
    expect(validate({ ...base, blurSize: 4 }).blurSize).toBe(4);
    expect(validate({ ...base, blurSize: 64 }).blurSize).toBe(64);
  });

  it.each([
    ['effort.avif', { qualities: { avif: 50, webp: 80 }, effort: { webp: 4 } }],
    ['qualities.avif', { qualities: { webp: 80 }, effort: { avif: 4, webp: 4 } }],
    ['effort.webp', { qualities: { avif: 50, webp: 80 }, effort: { avif: 4 } }],
    ['qualities.webp', { qualities: { avif: 50 }, effort: { avif: 4, webp: 4 } }],
  ])('U5 requires quality and effort in pairs (missing %s)', (missing, config) => {
    const err = catchConfigError(config);
    expect(err.messages).toHaveLength(1);
    expect(err.messages[0]).toContain(`'${missing}' must also be set`);
  });

  it.each([
    ['concurrency', { ...base, concurrency: -1 }],
    ['concurrency', { ...base, concurrency: 0 }],
    ['concurrency', { ...base, concurrency: 1.5 }],
    ['deviceSizes', { ...base, deviceSizes: [-10, 100] }],
    ['imageSizes', { ...base, imageSizes: [16.5, 32] }],
    ['breakpoints', { ...base, breakpoints: { sm: -1 } }],
    ['paths.input', { ...base, paths: { input: '' } }],
    ['paths.output', { ...base, paths: { output: '   ' } }],
    ['paths.types', { ...base, paths: { types: '' } }],
    ['paths.types', { ...base, paths: { types: 42 } }],
    ['exclusions', { ...base, exclusions: '.svg' }],
    ['qualities.webp', { qualities: { webp: 50.5 }, effort: { webp: 4 } }],
    ['minSizeToOptimize', { ...base, minSizeToOptimize: Number.NaN }],
  ])('U7 rejects a %s value that would crash or misbehave later (#13)', (field, config) => {
    const err = catchConfigError(config);
    expect(err.messages).toHaveLength(1);
    expect(err.messages[0]).toContain(field);
  });

  it('U6 aggregates every sorting error in one ConfigError', () => {
    const err = catchConfigError({
      ...base,
      breakpoints: { md: 768, sm: 640 },
      deviceSizes: [640, 640, 750],
      imageSizes: [64, 32],
    });
    expect(err.messages).toHaveLength(3);
    expect(err.message).toBe(err.messages.join('\n'));
  });
});
