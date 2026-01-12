import React, { CSSProperties } from 'react';

// ==============================================================================
// TYPE DEFINITIONS
// ==============================================================================

export interface GeneratedImageVariant {
  avif?: string;
  webp?: string;
}

export interface GeneratedImage {
  src: string;
  width: number;
  height: number;
  dominantColor?: string;
  variants: GeneratedImageVariant;
}

export interface GranularBreakpointOverrides { }

export type GranularBreakpoints = keyof GranularBreakpointOverrides extends never
  ? string
  : keyof GranularBreakpointOverrides;

export type ArtDirectionSrc = {
  [key in GranularBreakpoints]?: GeneratedImage;
} & { default: GeneratedImage };

export interface NextGranularImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height'> {
  src: GeneratedImage | ArtDirectionSrc;
  alt: string;
  className?: string;
  style?: CSSProperties;
  sizes?: string;
  customBreakpoints?: Record<string, number>;
  placeholder?: string | null;
  fetchPriority?: 'high' | 'low' | 'auto';
  fallbackSrc?: string;
}

const isGeneratedImage = (src: any): src is GeneratedImage => {
  return src && typeof src === 'object' && typeof src.src === 'string' && typeof src.width === 'number';
};

const DEFAULT_BREAKPOINTS: Record<string, number> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
};

// ==============================================================================
// COMPONENT
// ==============================================================================

export const NextGranularImage = ({
  src,
  alt,
  className,
  style,
  sizes,
  loading = 'lazy',
  decoding = 'async',
  fetchPriority = 'auto',
  customBreakpoints,
  placeholder,
  fallbackSrc,
  ...rest
}: NextGranularImageProps): React.ReactElement | null => {
  // ==========================================================================
  // STATE & SETUP
  // ==========================================================================

  let mainImage: GeneratedImage;
  let sources: React.ReactNode[] = [];
  let isArtDirection = false;

  // ==========================================================================
  // SOURCE RENDERING HELPER
  // ==========================================================================

  const renderSources = (img: GeneratedImage, media?: string) => {
    return (
      <React.Fragment key={media || 'default'}>
        {img.variants.avif && (
          <source
            srcSet={img.variants.avif}
            type="image/avif"
            media={media}
            sizes={sizes}
            width={img.width}
            height={img.height}
          />
        )}
        {img.variants.webp && (
          <source
            srcSet={img.variants.webp}
            type="image/webp"
            media={media}
            sizes={sizes}
            width={img.width}
            height={img.height}
          />
        )}

        {media && (
          <source
            srcSet={img.src}
            media={media}
            sizes={sizes}
            width={img.width}
            height={img.height}
          />
        )}
      </React.Fragment>
    );
  };

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  if (!src) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[NextGranularImage] "src" prop is missing or invalid.');
    }
    return null;
  }

  // ==========================================================================
  // IMAGE SOURCE PROCESSING
  // ==========================================================================

  if (isGeneratedImage(src)) {
    mainImage = src;
    const isGif = mainImage.src.toLowerCase().endsWith('.gif');
    if (!isGif) sources.push(renderSources(src));
  } else {
    const artSrc = src as ArtDirectionSrc;
    isArtDirection = true;

    if (!artSrc.default) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[NextGranularImage] Invalid "src". Expected GeneratedImage or object with "default" property.');
      }
      return null;
    }

    mainImage = artSrc.default;
    const isDefaultGif = mainImage.src.toLowerCase().endsWith('.gif');

    const effectiveBreakpoints = { ...DEFAULT_BREAKPOINTS, ...customBreakpoints };

    const breakpointEntries = Object.entries(effectiveBreakpoints)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .sort(([, a], [, b]) => b - a);

    breakpointEntries.forEach(([bpName, bpValue]) => {
      const img = artSrc[bpName];
      if (img && !img.src.toLowerCase().endsWith('.gif')) {
        const media = `(min-width: ${bpValue}px)`;
        sources.push(renderSources(img, media));
      }
    });

    if (!isDefaultGif) sources.push(renderSources(mainImage));
  }

  const aspectRatio = isArtDirection ? undefined : `${mainImage.width} / ${mainImage.height}`;

  const blurUrl = placeholder;

  const blurStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: blurUrl ? `url("${blurUrl}")` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    opacity: 1,
    transition: 'opacity 500ms ease-out',
    zIndex: -1,
    maskImage: 'radial-gradient(black 40%, transparent 100%)',
    WebkitMaskImage: 'radial-gradient(black 40%, transparent 100%)',
  };

  const hasPlaceholder = !!blurUrl;
  const isAbsolute = className?.includes('absolute') || style?.position === 'absolute';

  const [hasError, setHasError] = React.useState(false);

  if (hasError) {
    if (fallbackSrc) {
      return (
        <img
          src={fallbackSrc}
          alt={alt}
          className={className}
          style={style}
          {...rest}
        />
      );
    }
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[NextGranularImage] Failed to load image: ${mainImage.src}`);
    }
    return null;
  }

  return (
    <div
      className={`granular-image-wrapper ${className || ''}`}
      style={{
        position: isAbsolute ? undefined : 'relative',
        display: 'inline-block',
        lineHeight: 0,
        verticalAlign: 'top',
        ...style
      }}
    >
      {hasPlaceholder && (
        <div
          className="granular-blur-placeholder"
          style={blurStyle}
          data-granular-blur="true"
        />
      )}
      <picture>
        {sources}
        <img
          {...rest}
          {...(hasPlaceholder ? { 'data-granular-flow': 'true' } : {})}
          src={mainImage.src}
          alt={alt}
          {...(!isArtDirection && {
            width: mainImage.width,
            height: mainImage.height,
          })}
          loading={loading}
          decoding={decoding}
          fetchPriority={fetchPriority}
          sizes={sizes}
          className={className}
          onError={() => setHasError(true)}
          style={{
            width: '100%',
            aspectRatio,
            contentVisibility: 'auto',
            opacity: hasPlaceholder ? 0 : 1,
            transition: 'opacity 500ms ease-out',
          }}
        />
      </picture>
    </div>
  );
};
