import { describe, expect, it } from 'vitest';
import { sanitizeVarName } from '../../src/cli/core/generator';
import { isPlainIdentifier } from '../helpers/compile';

describe('sanitizeVarName', () => {
  it.each([
    ['hero-image', 'hero_image'],
    ['1st', '_1st'],
    ['a.b c', 'a_b_c'],
  ])('U21 turns %j into %j', (input, expected) => {
    expect(sanitizeVarName(input)).toBe(expected);
  });
});

describe('sanitizeVarName reserved words (#7)', () => {
  it.each(['class', 'default', 'new'])('U22 turns %j into a plain identifier', (word) => {
    const id = sanitizeVarName(word);
    expect(isPlainIdentifier(id)).toBe(true);
  });
});
