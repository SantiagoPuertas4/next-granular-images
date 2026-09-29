import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NextGranularImage, type ArtDirectionSrc, type GeneratedImage } from '../../src/client';
import { img } from './fixtures';

const sources = (container: HTMLElement) => Array.from(container.querySelectorAll('source'));
const imgEl = (container: HTMLElement) => container.querySelector('img')!;

describe('NextGranularImage', () => {
  it('X1 renders AVIF then WebP sources and a sized fallback img', () => {
    const hero = img('hero');
    const { container } = render(<NextGranularImage src={hero} alt="Hero" />);

    expect(container.querySelectorAll('picture')).toHaveLength(1);
    const s = sources(container);
    expect(s.map((el) => el.getAttribute('type'))).toEqual(['image/avif', 'image/webp']);
    expect(s[0].getAttribute('srcset')).toBe(hero.variants.avif);
    expect(s[1].getAttribute('srcset')).toBe(hero.variants.webp);

    const el = imgEl(container);
    expect(el.getAttribute('src')).toBe('/ngi/hero.jpg');
    expect(el.getAttribute('alt')).toBe('Hero');
    expect(el.getAttribute('width')).toBe('800');
    expect(el.getAttribute('height')).toBe('400');
  });

  it('X2 renders only the formats that exist', () => {
    const { container } = render(<NextGranularImage src={img('a', { avif: false })} alt="" />);
    expect(sources(container).map((el) => el.getAttribute('type'))).toEqual(['image/webp']);
  });

  it('X3 renders GIFs without <source> elements', () => {
    const { container } = render(<NextGranularImage src={img('anim', { ext: 'gif' })} alt="" />);
    expect(sources(container)).toHaveLength(0);
    expect(imgEl(container).getAttribute('src')).toMatch(/\.gif$/);
  });

  it('X4 orders art-direction sources from the widest breakpoint down', () => {
    const src: ArtDirectionSrc = { default: img('d'), md: img('m'), xl: img('x') };
    const { container } = render(<NextGranularImage src={src} alt="" />);

    expect(sources(container).map((el) => el.getAttribute('media'))).toEqual([
      '(min-width: 1280px)',
      '(min-width: 1280px)',
      '(min-width: 1280px)',
      '(min-width: 768px)',
      '(min-width: 768px)',
      '(min-width: 768px)',
      null,
      null,
    ]);
    const el = imgEl(container);
    expect(el.getAttribute('src')).toBe('/ngi/d.jpg');
    expect(el.hasAttribute('width')).toBe(false);
    expect(el.hasAttribute('height')).toBe(false);
  });

  it('X5 uses customBreakpoints for media queries', () => {
    const src = { default: img('d'), md: img('m'), '2xl': img('w') } as ArtDirectionSrc;
    const { container } = render(
      <NextGranularImage src={src} alt="" customBreakpoints={{ md: 900, '2xl': 1536 }} />
    );
    const media = sources(container).map((el) => el.getAttribute('media'));
    expect(media.slice(0, 3)).toEqual(Array(3).fill('(min-width: 1536px)'));
    expect(media.slice(3, 6)).toEqual(Array(3).fill('(min-width: 900px)'));
    expect(sources(container)[0].getAttribute('srcset')).toBe(img('w').variants.avif);
  });

  it('X6 renders nothing and reports an art-direction src without default', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <NextGranularImage src={{ md: img('m') } as unknown as ArtDirectionSrc} alt="" />
    );
    expect(container.innerHTML).toBe('');
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('X7 renders nothing for a missing src', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <NextGranularImage src={null as unknown as GeneratedImage} alt="" />
    );
    expect(container.innerHTML).toBe('');
  });

  it('X8 forwards sizes to every source and the img', () => {
    const { container } = render(<NextGranularImage src={img('a')} alt="" sizes="50vw" />);
    const all = [...sources(container), imgEl(container)];
    expect(all).toHaveLength(3);
    all.forEach((el) => expect(el.getAttribute('sizes')).toBe('50vw'));
  });

  it('X10 defaults to lazy/async and forwards other img props and handlers', () => {
    const first = render(<NextGranularImage src={img('a')} alt="" />);
    expect(imgEl(first.container).getAttribute('loading')).toBe('lazy');
    expect(imgEl(first.container).getAttribute('decoding')).toBe('async');
    first.unmount();

    const onLoad = vi.fn();
    const { container } = render(
      <NextGranularImage
        src={img('a')}
        alt=""
        loading="eager"
        id="hero"
        data-testid="pic"
        onLoad={onLoad}
      />
    );
    const el = imgEl(container);
    expect(el.getAttribute('loading')).toBe('eager');
    expect(el.id).toBe('hero');
    expect(el.getAttribute('data-testid')).toBe('pic');
    fireEvent.load(el);
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it('X14 sets fetch priority without React 18 unknown-prop warnings (#17)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const plain = render(<NextGranularImage src={img('a')} alt="" />);
    expect(imgEl(plain.container).hasAttribute('fetchpriority')).toBe(false);
    plain.unmount();

    const { container } = render(<NextGranularImage src={img('a')} alt="" fetchPriority="high" />);
    expect(imgEl(container).getAttribute('fetchpriority')).toBe('high');
    expect(error).not.toHaveBeenCalled();
  });

  it('applies className/style to the wrapper only, and imgClassName/imgStyle to the img (#17)', () => {
    const { container } = render(
      <NextGranularImage
        src={img('a')}
        alt=""
        className="card"
        style={{ margin: '4px' }}
        imgClassName="cover"
        imgStyle={{ objectFit: 'cover', width: '50%' }}
      />
    );
    const wrapper = container.firstElementChild as HTMLElement;
    const el = imgEl(container);

    expect(wrapper.classList.contains('card')).toBe(true);
    expect(wrapper.style.margin).toBe('4px');
    expect(el.classList.contains('card')).toBe(false);
    expect(el.style.margin).toBe('');

    expect(el.className).toBe('cover');
    expect(el.style.objectFit).toBe('cover');
    expect(el.style.width).toBe('50%');
    expect(wrapper.classList.contains('cover')).toBe(false);
  });

  it('does not force position: relative on an absolutely positioned wrapper', () => {
    const { container } = render(
      <NextGranularImage src={img('a')} alt="" style={{ position: 'absolute', inset: 0 }} />
    );
    expect((container.firstElementChild as HTMLElement).style.position).toBe('absolute');
  });

  it('X11 reserves the aspect ratio for single images only', () => {
    const single = render(<NextGranularImage src={img('a')} alt="" />);
    expect(imgEl(single.container).style.aspectRatio).toBe('800 / 400');
    single.unmount();

    const art = render(<NextGranularImage src={{ default: img('d'), md: img('m') }} alt="" />);
    expect(imgEl(art.container).style.aspectRatio).toBe('');
  });
});
