"use client";

import { useEffect } from 'react';

/**
 * This component attaches a global event listener to handle the removal
 * of blur placeholders from NextGranularImage components once the image loads.
 * 
 * Be sure to include this component ONCE in your Root Layout.
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
        img.style.opacity = '1';
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
