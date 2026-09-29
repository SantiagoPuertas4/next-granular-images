# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `imgClassName` and `imgStyle` props to style the inner `<img>`.
- Generated images now carry the configured breakpoints, and the component uses them for art direction at runtime.
- `clean --images` as an alias of `clean --image`.
- `engines.node` set to `>=20.19.0`.

### Changed

- **Behaviour change:** `className` and `style` now apply only to the wrapper element. They were previously also applied to the `<img>`; use `imgClassName` and `imgStyle` for that.
- Images are visible without JavaScript; `GranularBlurFix` now only fades out the blur placeholder.
- A missing config file is now an error that points to `init`.
- **Behaviour change:** `optimize` exits with code 1 if any image fails to process.
- **Behaviour change:** `generate` exits with code 1 when an image has no usable meta file (missing, corrupt or from an older version) or when source images exist but no meta file is found for any of them. With no source images at all it exits 0 and removes stale `images.gen.ts` files, like `optimize`. It no longer rewrites or deletes the `images.gen.ts` of a folder with such an image, so existing imports keep working until `optimize` runs.
- **Behaviour change:** `paths.output` outside `public/` is now an error.
- Stricter config validation: integer values, positive concurrency and sizes, non-empty paths.
- **Behaviour change:** meta files store output-relative paths and the cache hash changed, so the first run after upgrading rebuilds every image.
- GIFs are copied as-is instead of being re-encoded.
- **Behaviour change:** the public copy of each original (the `<img>` fallback) no longer carries metadata such as GPS position, camera data, comments or text chunks. JPEG, PNG and WebP originals without EXIF rotation have it removed losslessly at byte level: only the segments/chunks needed to decode the image (plus ICC profile, colour and animation data) are kept, the image data is not re-encoded, and a file with nothing to remove is written unchanged. A file whose structure cannot be parsed fails like any other processing error instead of being copied. Originals are re-encoded only when rotating (EXIF orientation), for TIFFs (their camera and GPS tags cannot be reliably detected) and for AVIFs carrying EXIF/XMP; the re-encode applies the rotation and keeps the ICC profile (JPEG, lossy WebP and AVIF at high quality, retried at a lower quality if the copy would grow more than 5%; lossless WebP, PNG and TIFF losslessly, palette PNGs as palette PNGs), and a re-encoded JPEG, PNG or WebP is stripped again. An AVIF without metadata or rotation is copied byte for byte. This also applies to files below `minSizeToOptimize`. GIFs and SVGs are still copied unchanged.
- `.heic` files are no longer picked up.
- `sharp` peer dependency range is now `^0.33.0 || ^0.34.0`.
- An unknown `LOG_LEVEL` falls back to `info`.

### Fixed

- Dimensions of EXIF-rotated images now use the display orientation.
- `optimize` deletes the previous version of an image only after the new one was written. An image that fails keeps its previous output and its export in `images.gen.ts`, and a half-written new version is removed.
- `optimize` rebuilds a cached image when any AVIF/WebP variant or original listed in its meta file is missing, instead of treating it as up to date.
- SVGs (when not excluded) get their real size from `width`/`height` or the `viewBox` instead of 0x0; an SVG without any size renders without `width`/`height`/`aspect-ratio` instead of collapsing.
- `generate` now works after `optimize --fast` or `--dev`.
- The ESM CLI entry now runs.
- Stale generated type files are removed for folders that no longer have images.
- Generated TypeScript is valid for unusual image and folder names.
- `srcset` URLs with spaces or `#` in the file name.
- Public URLs are built relative to the project `public/` directory.
- The config file is re-read on every load instead of being cached.
- `clean --all` works with a `.js` config file.
- `clean` with a missing or invalid config falls back to the default paths (still under the `next-granular-images` safety check) and logs them, instead of silently skipping the output and types folders.
- React 18 warning about the `fetchPriority` prop.
- Blur placeholder no longer rendered behind page backgrounds (removed `zIndex: -1`).
- The savings report measures AVIF, the format browsers download first.
- Generated output is in a deterministic order.
- Stale code-split chunks are no longer published in the package.

### Removed

- Runtime dependencies `fs-extra` (unused) and `p-queue` (now bundled into the CLI).

## [1.0.1] - 2026-01-12

### Fixed

- **Critical**: Fixed async/await bug in `getFileHash` that caused `[object Promise]` to appear in output paths for files larger than 1MB
  - `getFileHashStream` was returning a Promise but being cast to string incorrectly
  - Added proper `async/await` handling across `hash.ts`, `optimize.ts`, and `generate.ts`

## [1.0.0] - 2026-01-12

### Added

#### CLI Commands

- **`init`** - Initialize configuration with sensible defaults
  - `--build` flag to run optimization after init
  - `--build fast` for quick preview mode
  - `--build dev` for development mode
- **`optimize`** - Process and optimize all images
  - `--fast` flag for WebP-only quick builds (Q:15, E:1)
  - `--dev` flag for half-quality development builds
  - `--report` flag for detailed savings report per breakpoint
  - Content-based caching to skip unchanged images
  - Duplicate content and filename collision detection
  - Orphan file detection for stale outputs
- **`generate`** - Regenerate TypeScript types without reprocessing images
  - `--breakpoints` flag to regenerate only breakpoint types
  - `--images` flag to regenerate only image types
- **`clean`** - Remove generated files and artifacts
  - `--image` flag to clean only image artifacts
  - `--breakpoints` flag to clean only config types
  - `--all` flag for complete project reset

#### React Component

- **`NextGranularImage`** - Optimized image component
  - Art direction support with breakpoint-specific images
  - Responsive `srcSet` generation for AVIF and WebP
  - Blur placeholder support with smooth fade-in
  - GIF passthrough (no optimization applied)
  - Automatic aspect ratio preservation
  - Native lazy loading and async decoding
  - Fetch priority hints
  - Custom breakpoint overrides
- **`GranularBlurFix`** - Global blur placeholder handler
  - Automatic fade-out on image load
  - Handles pre-cached images on initial render

#### Configuration

- Independent AVIF and WebP quality settings (1-100)
- Independent effort/speed control per format
  - AVIF: 1-9 (higher = slower, better compression)
  - WebP: 1-6 (higher = slower, better compression)
- Configurable breakpoints for responsive generation
- Device sizes and image sizes arrays
- Parallel processing concurrency control
- Minimum file size threshold to skip optimization
- Blur placeholder size (4-64px) and quality settings
- Flexible input/output/types path configuration
- File exclusion patterns

#### Type Generation

- Auto-generated TypeScript definitions for all processed images
- Type-safe image imports with `GeneratedImage` interface
- Breakpoint type augmentation for art direction
- Blur placeholder exports as base64 strings

#### Build & Packaging

- Dual ESM/CJS module output
- TypeScript declaration files
- Separate entry points for client and CLI

### Technical Details

- Built with `tsup` for fast bundling
- Uses `sharp` for image processing
- `p-queue` for controlled parallel processing
- `jiti` for TypeScript config loading
- Content hashing with composite config+file hash for cache invalidation

---

[Unreleased]: https://github.com/SantiagoPuertas4/next-granular-images/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/SantiagoPuertas4/next-granular-images/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/SantiagoPuertas4/next-granular-images/releases/tag/v1.0.0
