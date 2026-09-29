"use client";

import { useEffect } from 'react';

/**
 * Fades in the image of every NextGranularImage with a placeholder once it has
 * loaded (or failed, so its alt text shows), fading the blur out at the same
 * time. Without JavaScript the image is shown right away by a <noscript> style.
 *
 * Include this component ONCE in your root layout.
 */
export function GranularBlurFix() {
  useEffect(() => {
    const reveal = (img: HTMLImageElement) => {
      const wrapper = img.closest('.granular-image-wrapper');
      if (!wrapper) return;
      const blurDiv = wrapper.querySelector<HTMLElement>('.granular-blur-placeholder');
      if (blurDiv) blurDiv.style.opacity = '0';
      img.style.opacity = '1';
    };

    const handleDone = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target instanceof HTMLImageElement && target.hasAttribute('data-granular-flow')) {
        reveal(target);
      }
    };

    // load/error do not bubble, so listen in the capture phase.
    document.addEventListener('load', handleDone, true);
    document.addEventListener('error', handleDone, true);

    // Images that finished (loaded or failed) before this effect ran, e.g.
    // cached images or fast loads before hydration, fire no further events.
    document.querySelectorAll<HTMLImageElement>('img[data-granular-flow]').forEach((img) => {
      if (img.complete) reveal(img);
    });

    return () => {
      document.removeEventListener('load', handleDone, true);
      document.removeEventListener('error', handleDone, true);
    };
  }, []);

  return null;
}
