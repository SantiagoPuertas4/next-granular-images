# next-granular-images

**Granular image optimization for Next.js SSG with independent AVIF/WebP quality control.**

A build-time image optimization library designed specifically for Next.js static site generation (SSG). It provides fine-grained control over AVIF and WebP encoding quality independently, generates responsive variants at multiple breakpoints, and outputs TypeScript types for type-safe image imports.

[![npm version](https://img.shields.io/npm/v/next-granular-images.svg)](https://www.npmjs.com/package/next-granular-images)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## Table of Contents

- [Features](#features)
- [Comparison with next-image-export-optimizer](#comparison-with-next-image-export-optimizer)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [Full Configuration Reference](#full-configuration-reference)
  - [Quality & Effort Settings](#quality--effort-settings)
  - [Paths Configuration](#paths-configuration)
  - [Breakpoints & Device Sizes](#breakpoints--device-sizes)
  - [Performance Tuning](#performance-tuning)
- [CLI Commands](#cli-commands)
  - [init](#init)
  - [optimize](#optimize)
  - [generate](#generate)
  - [clean](#clean)
- [React Component](#react-component)
  - [Basic Usage](#basic-usage)
  - [Props Reference](#props-reference)
  - [Art Direction (Responsive Images)](#art-direction-responsive-images)
  - [Blur Placeholder](#blur-placeholder)
  - [GranularBlurFix Component](#granularblurfix-component)
- [Generated Types](#generated-types)
- [Workflow Integration](#workflow-integration)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- 🎯 **Granular Quality Control** - Set AVIF and WebP quality independently (not a single quality for all formats)
- ⚡ **Build-Time Optimization** - All processing happens at build time, no server required
- 📱 **Responsive Variants** - Automatically generates images for all configured breakpoints and device sizes
- 🔒 **Type-Safe Imports** - Auto-generated TypeScript definitions for all processed images
- 🎨 **Art Direction Support** - Serve different images at different breakpoints (mobile vs desktop crops)
- 🖼️ **Blur Placeholders** - Built-in blur-up effect with configurable quality
- ⚙️ **Effort Control** - Fine-tune encoding speed vs compression ratio per format
- 🔄 **Smart Caching** - Content-based hashing ensures images are only reprocessed when changed
- 📊 **Size Reports** - Optional report showing savings per breakpoint
- 🧹 **Orphan Detection** - Detects and warns about unused optimized files

---

## Comparison with next-image-export-optimizer

| Feature                      | next-granular-images                                  | next-image-export-optimizer          |
| ---------------------------- | ----------------------------------------------------- | ------------------------------------ |
| **Quality Control**          | Independent AVIF/WebP quality settings                | Single quality value for all formats |
| **Effort/Speed Control**     | Configurable effort per format (AVIF: 1-9, WebP: 1-6) | Not configurable                     |
| **TypeScript Types**         | Auto-generates typed imports for all images           | Manual imports required              |
| **Art Direction**            | Built-in support with type-safe breakpoint overrides  | Requires manual implementation       |
| **Component API**            | Custom `NextGranularImage` with art direction props   | Wraps `next/image` component         |
| **Min Size Threshold**       | Skip optimization for small files                     | Not available                        |
| **Blur Placeholder**         | Configurable size and quality                         | Fixed implementation                 |
| **Duplicate Detection**      | Validates content hashes and filename collisions      | Not available                        |
| **Remote Images**            | Not supported (local only)                            | ✅ Supported                         |
| **next/image Compatibility** | Uses custom component                                 | Drop-in replacement                  |
| **Build Reports**            | Detailed savings per breakpoint                       | Basic output                         |

### When to choose next-granular-images:

- You need **independent AVIF/WebP quality** settings
- You want **type-safe image imports** with auto-generated TypeScript
- You need **art direction** with different images per breakpoint
- You want **fine control over encoding effort** for build time optimization
- Your project uses **local images only**

### When to choose next-image-export-optimizer:

- You need **remote image optimization**
- You prefer using the native `next/image` API
- You need a **drop-in solution** with minimal configuration

---

## Installation

```bash
# npm
npm install next-granular-images

# pnpm
pnpm add next-granular-images

# yarn
yarn add next-granular-images
```

### Peer Dependencies

Ensure you have these installed:

```bash
npm install sharp@^0.33.0
```

> **Note**: `sharp` is required for image processing. Next.js 13+ and React 18+ are also required as peer dependencies.

---

## Quick Start

### 1. Initialize the configuration

```bash
npx next-granular-images init
```

This creates `next-granular-images.config.ts` with sensible defaults.

### 2. Add your source images

Place your images in the configured input directory (default: `src/assets`).

### 3. Process images

```bash
npx next-granular-images optimize
```

This generates:

- Optimized AVIF/WebP variants in `public/next-granular-images/`
- TypeScript types in `src/generated/next-granular-images/`

### 4. Use in your components

```tsx
import { NextGranularImage } from 'next-granular-images';
import { heroImage } from '@/generated/next-granular-images/hero';

export function Hero() {
  return <NextGranularImage src={heroImage} alt="Hero image" sizes="100vw" />;
}
```

### 5. Add blur placeholder support (optional)

In your root layout:

```tsx
import { GranularBlurFix } from 'next-granular-images';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <GranularBlurFix />
        {children}
      </body>
    </html>
  );
}
```

---

## Configuration

### Full Configuration Reference

Create `next-granular-images.config.ts` in your project root:

```typescript
import { GranularImagesConfig } from 'next-granular-images';

const config: GranularImagesConfig = {
  // Image quality settings (1-100)
  qualities: {
    avif: 60, // AVIF quality (optional)
    webp: 85, // WebP quality (optional)
  },

  // Encoding effort (higher = slower but better compression)
  effort: {
    avif: 9, // AVIF effort: 1-9 (required if avif quality is set)
    webp: 6, // WebP effort: 1-6 (required if webp quality is set)
  },

  // Responsive breakpoints (generates variants for each)
  breakpoints: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
  },

  // Device widths for srcset generation
  deviceSizes: [400, 500, 640, 750, 828, 1080, 1200, 1920, 2048, 3840],

  // Image widths for smaller images (icons, thumbnails)
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],

  // Parallel processing (higher = faster but more memory)
  concurrency: 4,

  // Skip Sharp processing for files smaller than this (KB)
  minSizeToOptimize: 0,

  // Blur placeholder settings
  blurSize: 10, // 4-64 pixels
  blurQuality: 100, // 1-100

  // Path configuration
  paths: {
    input: 'src/assets',
    output: 'public/next-granular-images',
    types: 'src/generated/next-granular-images',
  },

  // Files to exclude from processing
  exclusions: ['.ico', '.xml', '.webmanifest', '.svg', '.webp', '.avif'],
};

export default config;
```

### Quality & Effort Settings

#### Qualities

At least one format (AVIF or WebP) must be configured:

```typescript
// AVIF only
qualities: { avif: 60 }

// WebP only
qualities: { webp: 85 }

// Both formats
qualities: { avif: 60, webp: 85 }
```

#### Effort

If a quality is set for a format, the corresponding effort **must** also be set:

| Format | Effort Range | Description                                         |
| ------ | ------------ | --------------------------------------------------- |
| AVIF   | 1-9          | Higher values = slower encoding, better compression |
| WebP   | 1-6          | Higher values = slower encoding, better compression |

```typescript
// Valid: Both quality and effort set
qualities: { avif: 60 },
effort: { avif: 9 }

// Invalid: Quality without effort
qualities: { avif: 60 },
effort: {} // ❌ Error
```

### Paths Configuration

| Path     | Default                              | Description                |
| -------- | ------------------------------------ | -------------------------- |
| `input`  | `src/assets`                         | Source images directory    |
| `output` | `public/next-granular-images`        | Optimized images output    |
| `types`  | `src/generated/next-granular-images` | Generated TypeScript types |

> ⚠️ **Important**: The output path should be inside `public/` for Next.js to serve the files. The path should contain `next-granular-images` for safety checks during cleanup.

### Breakpoints & Device Sizes

**Breakpoints** define art direction boundaries:

```typescript
breakpoints: {
  sm: 640,   // Mobile
  md: 768,   // Tablet
  lg: 1024,  // Desktop
  xl: 1280,  // Large screens
}
```

**Device Sizes** define the actual widths for generated variants:

```typescript
deviceSizes: [400, 500, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];
```

Both arrays must be sorted in **ascending order**.

### Performance Tuning

| Option              | Default | Description                           |
| ------------------- | ------- | ------------------------------------- |
| `concurrency`       | 4       | Images processed in parallel          |
| `minSizeToOptimize` | 0       | Skip Sharp for files < this size (KB) |

```typescript
// For machines with lots of RAM
concurrency: 8,

// Skip processing for tiny files (copied as-is)
minSizeToOptimize: 10, // Files < 10KB are just copied
```

---

## CLI Commands

All commands are run via `npx next-granular-images <command>` or configured as npm scripts.

### init

Initialize the library in your project.

```bash
npx next-granular-images init [options]
```

**Options:**

| Flag           | Description                                        |
| -------------- | -------------------------------------------------- |
| `--build`      | Run optimize after init (default: production mode) |
| `--build fast` | Run optimize in fast mode after init               |
| `--build dev`  | Run optimize in dev mode after init                |

**Examples:**

```bash
# Create config file only
npx next-granular-images init

# Create config and immediately process images
npx next-granular-images init --build

# Create config and process in fast mode
npx next-granular-images init --build fast
```

**Behavior:**

- Creates `next-granular-images.config.ts` with default settings
- Skips creation if config already exists
- Optionally runs `optimize` with specified mode

---

### optimize

Process all images according to configuration.

```bash
npx next-granular-images optimize [options]
```

**Options:**

| Flag       | Description                                      |
| ---------- | ------------------------------------------------ |
| `--fast`   | WebP only, Q:15, E:1 (fastest, lowest quality)   |
| `--dev`    | Half quality, effort 1 (fast development builds) |
| `--report` | Show detailed savings report per breakpoint      |

**Examples:**

```bash
# Production build (full quality)
npx next-granular-images optimize

# Quick preview during development
npx next-granular-images optimize --fast

# Development build with reasonable quality
npx next-granular-images optimize --dev

# Production build with savings report
npx next-granular-images optimize --report
```

**Process:**

1. **Scans** input directory for images
2. **Validates** for duplicate content and filename collisions
3. **Generates** responsive variants for each breakpoint
4. **Creates** blur placeholders
5. **Outputs** optimized files with content-based hashes
6. **Generates** TypeScript type definitions
7. **Detects** orphaned files from previous builds

**Caching:**

Images are cached based on a composite hash of:

- File content hash
- Configuration hash

If neither changes, the image is skipped (cache hit).

**Sample Output:**

```
🚀 Starting Next Granular Images (Optimize)...
Found 24 images.
Processing: hero/desktop.png
Processing: hero/mobile.png
Processing: products/item-1.jpg
...

📊 Savings Report:
┌─────┬───────────┬───────────┬─────────┬──────┐
│     │ Original  │ Optimized │ Saved   │ %    │
├─────┼───────────┼───────────┼─────────┼──────┤
│ sm  │ 12.50 MB  │ 2.30 MB   │ 10.20 MB│ 81.6%│
│ md  │ 12.50 MB  │ 3.10 MB   │ 9.40 MB │ 75.2%│
│ lg  │ 12.50 MB  │ 4.50 MB   │ 8.00 MB │ 64.0%│
│ xl  │ 12.50 MB  │ 5.80 MB   │ 6.70 MB │ 53.6%│
└─────┴───────────┴───────────┴─────────┴──────┘

✨ Done in 45.32s
Processed: 24
Cached: 0
```

---

### generate

Regenerate TypeScript types without reprocessing images.

```bash
npx next-granular-images generate [options]
```

**Options:**

| Flag            | Description                                      |
| --------------- | ------------------------------------------------ |
| (none)          | Regenerate all types (breakpoints + images)      |
| `--breakpoints` | Regenerate only breakpoint types (`config.d.ts`) |
| `--images`      | Regenerate only image types                      |

**Examples:**

```bash
# Regenerate all types from existing optimized images
npx next-granular-images generate

# Regenerate only breakpoint types (after config change)
npx next-granular-images generate --breakpoints

# Regenerate only image types
npx next-granular-images generate --images
```

**Use cases:**

- TypeScript files were accidentally deleted
- You manually modified the output directory
- You changed breakpoints in config and need to update types
- Types need updating without full reprocessing

---

### clean

Remove generated files and artifacts.

```bash
npx next-granular-images clean [options]
```

**Options:**

| Flag            | Description                                        |
| --------------- | -------------------------------------------------- |
| (none)          | Clean output directory and types directory         |
| `--image`       | Clean only image artifacts (keeps config types)    |
| `--breakpoints` | Clean only `config.d.ts` (breakpoint types)        |
| `--all`         | Full reset: removes output, types, and config file |

**Examples:**

```bash
# Standard cleanup (output + types)
npx next-granular-images clean

# Remove only optimized images
npx next-granular-images clean --image

# Remove only breakpoint config types
npx next-granular-images clean --breakpoints

# Complete reset (restore to pre-init state)
npx next-granular-images clean --all
```

**Safety:**

The clean command includes a safety check that requires paths to contain `next-granular-images` to prevent accidental deletion of unrelated directories.

---

## React Component

### Basic Usage

```tsx
import { NextGranularImage } from 'next-granular-images';
import { productImage } from '@/generated/next-granular-images/products';

export function ProductCard() {
  return (
    <NextGranularImage
      src={productImage}
      alt="Product name"
      sizes="(max-width: 768px) 100vw, 50vw"
    />
  );
}
```

### Props Reference

| Prop                | Type                                | Default      | Description                                    |
| ------------------- | ----------------------------------- | ------------ | ---------------------------------------------- |
| `src`               | `GeneratedImage \| ArtDirectionSrc` | **required** | Generated image object or art direction object |
| `alt`               | `string`                            | **required** | Alt text for accessibility                     |
| `sizes`             | `string`                            | -            | Responsive sizes attribute                     |
| `className`         | `string`                            | -            | CSS class names                                |
| `style`             | `CSSProperties`                     | -            | Inline styles                                  |
| `loading`           | `'lazy' \| 'eager'`                 | `'lazy'`     | Loading strategy                               |
| `decoding`          | `'async' \| 'sync' \| 'auto'`       | `'async'`    | Decoding hint                                  |
| `fetchPriority`     | `'high' \| 'low' \| 'auto'`         | `'auto'`     | Fetch priority hint                            |
| `placeholder`       | `string \| null`                    | -            | Blur placeholder URL                           |
| `customBreakpoints` | `Record<string, number>`            | -            | Override default breakpoints                   |

### Art Direction (Responsive Images)

Serve different images at different breakpoints:

```tsx
import { NextGranularImage } from 'next-granular-images';
import { heroDesktop } from '@/generated/next-granular-images/hero/desktop';
import { heroMobile } from '@/generated/next-granular-images/hero/mobile';

export function Hero() {
  return (
    <NextGranularImage
      src={{
        default: heroMobile, // Used for smallest screens + fallback
        md: heroDesktop, // Used for screens >= 768px
      }}
      alt="Hero banner"
      sizes="100vw"
    />
  );
}
```

The breakpoint keys (`sm`, `md`, `lg`, `xl`) correspond to your config's `breakpoints` and are type-checked via the generated `config.d.ts`.

### Blur Placeholder

Enable blur-up effect with the generated placeholder:

```tsx
import { NextGranularImage } from 'next-granular-images';
import {
  productImage,
  productImageBlur,
} from '@/generated/next-granular-images/products';

export function ProductCard() {
  return (
    <NextGranularImage
      src={productImage}
      alt="Product"
      placeholder={productImageBlur}
    />
  );
}
```

The blur placeholder is a tiny base64-encoded image that displays while the full image loads.

### GranularBlurFix Component

For the blur-to-clear transition to work, add `GranularBlurFix` once in your root layout:

```tsx
// app/layout.tsx
import { GranularBlurFix } from 'next-granular-images';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <GranularBlurFix />
        {children}
      </body>
    </html>
  );
}
```

This component:

- Attaches a global load event listener
- Fades out blur placeholders when images load
- Handles already-cached images on initial render

---

## Generated Types

After running `optimize`, TypeScript types are generated in your configured types directory.

### Directory Structure

```
src/generated/next-granular-images/
├── config.d.ts              # Breakpoint type definitions
├── hero/
│   ├── index.ts             # Exports all images in hero/
│   └── ...
├── products/
│   ├── index.ts
│   └── ...
└── index.ts                 # Root exports
```

### Type Definitions

Each image generates:

```typescript
// GeneratedImage type
export const heroImage: GeneratedImage = {
  src: '/next-granular-images/hero/desktop-abc123.jpg',
  width: 1920,
  height: 1080,
  variants: {
    avif: '/next-granular-images/hero/desktop-abc123/...',
    webp: '/next-granular-images/hero/desktop-abc123/...',
  },
};

// Blur placeholder (base64)
export const heroImageBlur: string = 'data:image/webp;base64,...';
```

### Breakpoint Type Safety

The generated `config.d.ts` augments the component's breakpoint types:

```typescript
// config.d.ts (auto-generated)
declare module 'next-granular-images' {
  interface GranularBreakpointOverrides {
    sm: true;
    md: true;
    lg: true;
    xl: true;
  }
}
```

This provides type checking for art direction keys:

```tsx
<NextGranularImage
  src={{
    default: mobileImage,
    md: desktopImage,
    invalid: otherImage, // ❌ TypeScript error
  }}
  alt="..."
/>
```

---

## Workflow Integration

### Package.json Scripts

```json
{
  "scripts": {
    "images": "next-granular-images optimize",
    "images:fast": "next-granular-images optimize --fast",
    "images:dev": "next-granular-images optimize --dev",
    "images:report": "next-granular-images optimize --report",
    "images:clean": "next-granular-images clean",
    "images:reset": "next-granular-images clean --all",
    "prebuild": "next-granular-images optimize"
  }
}
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Install dependencies
  run: pnpm install

- name: Optimize images
  run: pnpm images

- name: Build Next.js
  run: pnpm build
```

### Development Workflow

1. **Initial setup**: `npx next-granular-images init --build`
2. **During development**: `npm run images:fast` for quick previews
3. **Before commit**: `npm run images:dev` for reasonable quality
4. **Production build**: `npm run images` (or let `prebuild` handle it)

### Gitignore

Add to `.gitignore`:

```gitignore
# Optimized images (regenerated on build)
public/next-granular-images/

# Generated types (regenerated on build)
src/generated/next-granular-images/
```

> **Note**: Consider whether to commit generated files. For faster CI builds, you may want to commit them. For smaller repo size, exclude them.

---

## Troubleshooting

### Common Issues

#### "Input directory not found"

```
Error: Input directory not found: /path/to/src/assets
```

**Solution**: Create the input directory or update `paths.input` in your config.

#### "Duplicate image content found"

```
Error: Duplicate image content found.
The following files are identical:
- Hash abc123:
  hero/image.png
  backup/image.png
```

**Solution**: Remove duplicate files. The library requires unique content to prevent redundant processing.

#### "Duplicate image names found"

```
Error: Duplicate image names found.
The library generates variables based on filenames (ignoring extensions).
- products/item.png matches products/item.jpg
```

**Solution**: Rename files to have unique base names, as TypeScript exports are generated from filenames.

#### "Output directory path does not contain 'next-granular-images'"

```
SKIPPED: Output directory path '/public/images' does not contain 'next-granular-images'. Safety check failed.
```

**Solution**: Update `paths.output` to include `next-granular-images` in the path (e.g., `public/next-granular-images`).

#### Images not updating after changes

**Solution**: The library uses content hashing. If you only renamed a file without changing content, delete the old output and re-run optimize, or run `clean` first.

### Debug Output

For more verbose output, check the processing logs:

```bash
npx next-granular-images optimize 2>&1 | tee optimize.log
```

---

## License

MIT © Santiago Puertas

```
MIT License

Copyright (c) 2025 Santiago Puertas

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
