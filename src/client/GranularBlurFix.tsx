"use client";

/**
 * No longer needed: `NextGranularImage` fades its image in over the blur
 * placeholder by itself. Kept so existing layouts that render it keep
 * working; it renders nothing and can be removed.
 *
 * @deprecated Optional since 1.1.0; safe to remove.
 */
export function GranularBlurFix(): null {
  return null;
}
