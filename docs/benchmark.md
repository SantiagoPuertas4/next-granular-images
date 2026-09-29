# Benchmark: image bytes per viewport

A lab measurement of how many image bytes a browser downloads with and without `next-granular-images`, on a real production site. It measures **bytes only**. It does not measure load time, LCP or any Core Web Vitals, and no such claim follows from it.

## Summary

With AVIF served (Chromium), fewer image bytes with the library:

| Baseline | All 7 pages combined, per viewport | Per page and viewport |
| --- | --- | --- |
| A. Unprocessed original files | 98.39% to 99.61% | 95.41% to 99.83% |
| A'. One hand-exported JPEG per image (max 1920 px wide, mozjpeg q80) | 47.43% to 88.76% | 18.62% to 91.42% |

The combined figures sum the bytes of all 7 pages for each of the 8 viewport configurations (8 values per baseline); the per-page figures cover the 56 page and viewport rows.

Both numbers describe the same library output. Baseline A is "no optimisation at all"; baseline A' approximates "a developer exported one reasonable file". Read them together.

The library does not compress better than sharp: it uses sharp. The savings come from automating what is otherwise manual work: AVIF/WebP variants per width, `<picture>`/`<source>` markup with `srcset` and `sizes`, art direction per breakpoint, and blur placeholders.

## Method

### What was measured

The sum of transferred bytes (CDP `encodedDataLength`, headers plus body) for every request of resource type `Image`, excluding SVG, favicons/app icons and `data:` URIs. Each page was loaded, scrolled incrementally to the bottom, and measured once all rendered `<img>` elements had completed and no image request had been pending for 500 ms (30 s hard cap, never hit).

### Site and pages

- Site: the landing site of solucionesproyectables.com, built with `next build` as a static export.
- Library version: `next-granular-images` 1.0.1.
- Pages (every page that uses `NextGranularImage`): `/`, `/asesoramiento/consultoria/`, `/asesoramiento/soporte/`, `/capacitacion/`, `/productos/eco-aislacion/`, `/productos/premecol/`, `/productos/wpc-deck/`.

Library configuration used by the site:

```ts
qualities: { avif: 60, webp: 85 },
effort: { avif: 9, webp: 6 },
breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280 },
deviceSizes: [400, 500, 640, 750, 828, 1080, 1200, 1920, 2048, 3840],
imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
```

### Viewports

8 configurations (width in CSS px @ device pixel ratio): 375@1x, 640@1x, 768@1x, 1024@1x, 1280@1x, 1920@1x, 375@2x, 1280@2x. 7 pages x 8 configurations = 56 measurements.

### Baselines

- **B (library):** the site as committed, with generated variants in `public/next-granular-images`.
- **A (unprocessed originals):** the same build with `NextGranularImage` replaced by a plain `<img src>` pointing at a byte-identical copy of the unprocessed source file, with the same `alt`, class names, wrapper, CSS sizing and `loading` attribute. No `<picture>`, `srcset`, `sizes`, AVIF/WebP or blur placeholder. For art-directed images (the home hero: mobile file by default, desktop file from `md`), the single `<img>` uses the widest-breakpoint file.
- **A' (hand-exported JPEG):** offline, not browser-measured. Each baseline image is replaced by a JPEG exported with sharp (max 1920 px wide, mozjpeg, quality 80) from the same source; library bytes are the measured B values. Savings are `(A' - B) / A'`.

Savings for A are `(A - B) / A`.

### Environment and tools

- Playwright 1.63, headless Chromium (AVIF supported), a fresh browser context per load, cache disabled via CDP `Network.setCacheDisabled`.
- Local static server (`npx serve`), no network throttling, no CDN.
- Next.js RSC prefetch requests (`*.txt?_rsc=`) were aborted, because on some pages they never settle and would block the idle wait.

### Runs

45 of the 56 measurements are the median of 3 runs. All 90 repeat series were byte-identical (zero delta), so the remaining 11 ran once: premecol 1920@1x, 375@2x and 1280@2x, and all 8 wpc-deck configurations. The script was revised mid-run (the RSC abort above); re-measuring home 1280@1x and capacitacion/eco-aislacion at 375@1x and 1024@1x with the revised script gave the same bytes.

## Results

### All 7 pages combined, per viewport

KB = 1024 bytes.

| Viewport | A: originals (KB) | A': JPEG q80 (KB) | B: library (KB) | Savings vs A | Savings vs A' |
| --- | ---: | ---: | ---: | ---: | ---: |
| 375@1x | 50821.1 | 1776.0 | 199.7 | 99.61% | 88.76% |
| 640@1x | 50821.1 | 1776.0 | 360.5 | 99.29% | 79.70% |
| 768@1x | 50821.1 | 1776.0 | 558.8 | 98.90% | 68.54% |
| 1024@1x | 78319.9 | 2392.0 | 954.4 | 98.78% | 60.10% |
| 1280@1x | 78319.9 | 2392.0 | 1129.4 | 98.56% | 52.79% |
| 1920@1x | 78319.9 | 2392.0 | 1234.7 | 98.42% | 48.38% |
| 375@2x | 50821.1 | 1776.0 | 421.2 | 99.17% | 76.28% |
| 1280@2x | 78319.9 | 2392.0 | 1257.4 | 98.39% | 47.43% |

### Per page

Savings per page and configuration (A = originals, A' = JPEG q80):

| Page | 375@1x | 640@1x | 768@1x | 1024@1x | 1280@1x | 1920@1x | 375@2x | 1280@2x |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 99.83 / 91.22 | 99.74 / 86.07 | 99.53 / 75.07 | 99.59 / 47.70 | 99.49 / 34.23 | 99.38 / 20.05 | 99.71 / 84.65 | 99.37 / 18.62 |
| `/asesoramiento/consultoria/` | 98.63 / 87.11 | 97.05 / 72.18 | 95.53 / 57.90 | 95.53 / 57.90 | 95.53 / 57.90 | 95.53 / 57.90 | 96.17 / 63.87 | 95.53 / 57.90 |
| `/asesoramiento/soporte/` | 98.44 / 83.61 | 96.76 / 66.05 | 95.41 / 51.89 | 95.41 / 51.89 | 95.41 / 51.89 | 95.41 / 51.89 | 95.97 / 57.73 | 95.41 / 51.89 |
| `/capacitacion/` | 98.42 / 82.69 | 97.27 / 69.98 | 96.40 / 60.47 | 95.92 / 56.45 | 95.92 / 56.45 | 95.92 / 56.45 | 96.76 / 64.45 | 95.92 / 56.45 |
| `/productos/eco-aislacion/` | 99.70 / 91.42 | 99.53 / 86.71 | 99.22 / 78.10 | 98.53 / 71.42 | 97.78 / 56.88 | 97.61 / 53.64 | 99.53 / 86.71 | 97.51 / 51.59 |
| `/productos/premecol/` | 99.57 / 89.68 | 99.29 / 82.93 | 98.89 / 73.43 | 97.78 / 68.60 | 97.05 / 58.29 | 96.50 / 50.45 | 99.23 / 81.63 | 96.39 / 49.01 |
| `/productos/wpc-deck/` | 99.70 / 91.42 | 99.53 / 86.71 | 99.22 / 78.10 | 98.53 / 71.42 | 97.78 / 56.88 | 97.61 / 53.64 | 99.53 / 86.71 | 97.51 / 51.59 |

Values are percentages, `vs A / vs A'`. Across the 56 rows, savings vs A range from 95.41% to 99.83%, and savings vs A' from 18.62% to 91.42%. Byte counts for every row are in the raw data below.

### Quality spot check

One image only: the home hero at 1280@1x, where the browser picked the 1920w variant. SSIM against the original resized with sharp (lanczos3) to the served size, using ssim.js (Wang et al. 2004):

| Format | File (KB) | SSIM | SSIM, no downsampling |
| --- | ---: | ---: | ---: |
| AVIF q60 | 94.5 | 0.997 | 0.975 |
| WebP q85 | 156.7 | 0.9975 | 0.974 |

No other image was quality-checked.

## Limitations and threats to validity

- **Lab only.** Local static server, headless Chromium, no throttling, no CDN. Production was not measured.
- **Bytes, not speed.** Fewer bytes do not translate into a measured load-time or Web Vitals improvement; neither was measured.
- **Heavy sources inflate baseline A.** Several originals on this site are very large PNGs (the largest is 45.7 MB at 12660 px wide), which pushes savings vs A towards 99%. Baseline A' is included to show the result against a sensible manual export; it is computed offline, not measured in a browser.
- **AVIF only.** Chromium supports AVIF, so only AVIF variants were served. The WebP and original fallbacks for browsers without AVIF were not measured; for the hero, the WebP file is about 1.6x the AVIF size.
- **Art direction counts as savings.** A single `<img>` can reference one file, so baseline A uses the desktop hero at every width. With the mobile hero file as the mobile baseline instead, product pages at 375@1x would show about 97.7% instead of 99.7% vs A.
- **Resolution cap.** The consultoria, soporte and capacitacion sources are 1024 px wide, so 828w is the largest generated variant (1080 exceeds the source; 1024 is not in `deviceSizes`). From 768 px up, and at 1280@2x, those pages receive an 828w image stretched across the layout. Part of their saving is lower delivered resolution, not only better encoding.
- **HTML overhead is excluded.** `srcset` strings and inline base64 blur placeholders add to the HTML: the home `index.html` grew by 65 KB raw (8.8 KB gzipped: 22.5 vs 31.3 KB); premecol by 32 KB raw (4.8 KB gzipped).
- **Fetch behaviour.** A URL is fetched once per document (for example, the home hero and three slides share one file in baseline A), and lazy images inside `display: none` containers are not fetched in either variant.
- **One site.** Results depend on the source images, layout and `sizes` of this site. They are not a general prediction for other sites.

## Raw data

[`benchmark-data/results.csv`](benchmark-data/results.csv) has one row per page and configuration: page, viewport, DPR, baseline A bytes, library bytes, savings vs A, baseline A' bytes, savings vs A', and number of runs. It is derived unchanged from the original results file.

The original results file also lists every image chosen per configuration, and the measurement script and baseline shim reference the site's private repository and source asset names. Those are not published here; they are available on request.
