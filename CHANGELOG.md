# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Tree-shakeable exports

### Technical Details

- Built with `tsup` for fast bundling
- Uses `sharp` for image processing
- `p-queue` for controlled parallel processing
- `jiti` for TypeScript config loading
- Content hashing with composite config+file hash for cache invalidation

---

[1.0.1]: https://github.com/SantiagoPuertas4/next-granular-images/releases/tag/v1.0.1
[1.0.0]: https://github.com/SantiagoPuertas4/next-granular-images/releases/tag/v1.0.0
