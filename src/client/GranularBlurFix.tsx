"use client";

import { useEffect } from 'react';

/**
 * Optional enhancement: fades out the blur placeholder of every
 * NextGranularImage once its image has loaded (useful for transparent images,
 * where the blur would otherwise stay visible behind them). Images are visible
 * without it.
 *
 * Include this component ONCE in your root layout.
 */
export function GranularBlurFix() {
  useEffect(() => {
    const removeBlur = (img: HTMLImageElement) => {
      const picture = img.parentElement;
      const wrapper = picture?.parentElement;
      if (wrapper?.classList.contains('granular-image-wrapper')) {
        const blurDiv = wrapper.querySelector('.granular-blur-placeholder') as HTMLElement;
        if (blurDiv) {
          blurDiv.style.opacity = '0';
        }
      }
    };

    const handleLoad = (e: Event) => {
      const target = e.target as HTMLImageElement;
      if (target.tagName === 'IMG' && target.hasAttribute('data-granular-flow')) {
        removeBlur(target);
      }
    };

    document.addEventListener('load', handleLoad, true);

    const existingImages = document.querySelectorAll('img[data-granular-flow]');
    existingImages.forEach((img) => {
      if ((img as HTMLImageElement).complete) {
        removeBlur(img as HTMLImageElement);
      }
    });

    return () => {
      document.removeEventListener('load', handleLoad, true);
    };
  }, []);

  return null;
}
