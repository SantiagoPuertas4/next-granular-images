import { describe, expect, it } from 'vitest';
import { sanitizeVarName } from '../../src/cli/core/generator';

describe('sanitizeVarName', () => {
  it.each([
    ['hero-image', 'hero_image'],
    ['1st', '_1st'],
    ['a.b c', 'a_b_c'],
  ])('U21 turns %j into %j', (input, expected) => {
    expect(sanitizeVarName(input)).toBe(expected);
  });
});
