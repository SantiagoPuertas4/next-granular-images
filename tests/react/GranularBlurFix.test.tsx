import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GranularBlurFix, NextGranularImage } from '../../src/client';
import { img } from './fixtures';

const PLACEHOLDER = 'data:image/jpeg;base64,AA';

describe('GranularBlurFix', () => {
  it('renders nothing (kept only for backwards compatibility)', () => {
    const { container } = render(<GranularBlurFix />);
    expect(container.innerHTML).toBe('');
  });

  it('X12 does not get in the way of images that reveal themselves', () => {
    const { container } = render(
      <>
        <GranularBlurFix />
        <NextGranularImage src={img('a')} alt="" placeholder={PLACEHOLDER} />
      </>
    );
    const el = container.querySelector('img')!;
    fireEvent.load(el);
    expect(el.style.opacity).toBe('1');
    expect(container.querySelector<HTMLElement>('.granular-blur-placeholder')!.style.opacity).toBe('0');
  });
});
