import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GranularBlurFix, NextGranularImage } from '../../src/client';
import { img } from './fixtures';

const PLACEHOLDER = 'data:image/jpeg;base64,AA';
const blurOf = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('.granular-blur-placeholder')!;

describe('GranularBlurFix', () => {
  it('X12 fades the placeholder out when the image loads', () => {
    const { container } = render(
      <>
        <NextGranularImage src={img('a')} alt="" placeholder={PLACEHOLDER} />
        <GranularBlurFix />
      </>
    );
    const el = container.querySelector('img')!;
    expect(blurOf(container).style.opacity).toBe('1');
    expect(el.style.opacity).toBe('0');
    fireEvent.load(el);
    expect(blurOf(container).style.opacity).toBe('0');
    expect(el.style.opacity).toBe('1');
    expect(el.style.transition).toBe('opacity 500ms ease-out');
  });

  it('shows the img (and its alt text) when it fails to load', () => {
    const { container } = render(
      <>
        <NextGranularImage src={img('a')} alt="broken" placeholder={PLACEHOLDER} />
        <GranularBlurFix />
      </>
    );
    const el = container.querySelector('img')!;
    fireEvent.error(el);
    expect(el.style.opacity).toBe('1');
    expect(blurOf(container).style.opacity).toBe('0');
  });

  it('X13 hides placeholders of already-complete images on mount', () => {
    const complete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete');
    Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true });
    try {
      const { container, rerender } = render(
        <NextGranularImage src={img('a')} alt="" placeholder={PLACEHOLDER} />
      );
      expect(blurOf(container).style.opacity).toBe('1');
      rerender(
        <>
          <NextGranularImage src={img('a')} alt="" placeholder={PLACEHOLDER} />
          <GranularBlurFix />
        </>
      );
      expect(blurOf(container).style.opacity).toBe('0');
      expect(container.querySelector('img')!.style.opacity).toBe('1');
    } finally {
      if (complete) Object.defineProperty(HTMLImageElement.prototype, 'complete', complete);
    }
  });

  it('X13 stops listening after unmount', () => {
    const fix = render(<GranularBlurFix />);
    fix.unmount();
    const { container } = render(
      <NextGranularImage src={img('b')} alt="" placeholder={PLACEHOLDER} />
    );
    fireEvent.load(container.querySelector('img')!);
    expect(blurOf(container).style.opacity).toBe('1');
    expect(container.querySelector('img')!.style.opacity).toBe('0');
  });

  it('ignores load events from unrelated images', () => {
    const { container } = render(
      <>
        <NextGranularImage src={img('a')} alt="" placeholder={PLACEHOLDER} />
        <img alt="other" src="/other.png" />
        <GranularBlurFix />
      </>
    );
    fireEvent.load(container.querySelector('img[alt="other"]')!);
    expect(blurOf(container).style.opacity).toBe('1');
  });
});
