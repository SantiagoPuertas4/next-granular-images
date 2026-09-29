# Test plan (Vitest)

Scope: `next-granular-images@1.0.1`. Bug numbers (`#n`) refer to "Suspected bugs" in `POLISH_STATE.md`.

## Ground rules

- Every test asserts observable behaviour (return value, file on disk, exit code, DOM attribute, compiler diagnostics). No snapshot-only tests.
- Tests that expose a bug assert the **correct** behaviour. Each one lands in the same commit as its fix. If the fix still needs user approval (see the last section), the test is committed as `it.fails(...)` with the bug id in its title. `it.fails` goes red once the behaviour changes, so the test has to be flipped on purpose.
- Fixtures are generated inside the test with `sharp({ create })` into `fs.mkdtemp(os.tmpdir())`. No binary fixtures are committed. Every temp dir is removed in `afterEach`.
- The fast test config is `deviceSizes: [100, 200, 400]`, `imageSizes: [16, 32]`, `qualities: { avif: 30, webp: 50 }`, `effort: { avif: 1, webp: 1 }`.

## Minimal refactors for testability (no public API change)

Everything below is internal to `src/cli`. The package's public exports (`src/client/index.ts`) and the generated file shapes stay the same.

| # | Refactor | Why |
|---|---|---|
| R1 | Export `sanitizeVarName` from `core/generator.ts`. | Unit-test naming rules (#7). |
| R2 | Move `toPublicUrl(absPath, publicRoot)` and `buildSrcSet(variants, publicRoot)` out of the `generateTypeScriptFile` closure into `core/urls.ts`. `publicRoot` defaults to `<cwd>/public`. | Test them as pure functions (#8). |
| R3 | Move the duplicated extension list and filter from `optimize.ts`/`generate.ts` into `core/files.ts` as `SUPPORTED_EXTENSIONS` and `isProcessableImage(file, { outputDir, exclusions })`. | One filter, tested once (#6, #11). |
| R4 | Extract `computeTargetWidths(config, width)` from `processImage`. | Test dedupe and upper bound (#6). |
| R5 | Extract `pickClosestWidth(widths, target)` and `summarizeSavings(stats)` from `optimize.ts`. | Test the savings math (#15). |
| R6 | Export the `Logger` class. The `logger` singleton stays. | Construct a logger with a given env (#14). |
| R7 | Commands accept an optional `{ cwd }` (default `process.cwd()`). `process.exit(n)` inside commands becomes `throw new CliExit(n)`, which `cli/index.ts` catches and turns into `process.exit(n)`. | Run in-process for coverage without killing the worker. CLI tests still cover the real exit path. |

## 1. Unit (`tests/unit`, node): 36 tests

| ID | Target | Setup | Action | Assertion | Bug |
|---|---|---|---|---|---|
| U1 | `core/validate.ts:validateConfig` | `{qualities:{webp:80},effort:{webp:4}}` | call | `paths` = `public` / `public/next-granular-images` / `src/generated/next-granular-images`; `blurSize` 10, `blurQuality` 50, `concurrency` 4, `minSizeToOptimize` 0; `exclusions` equals the 6 defaults; `deviceSizes[0]` 640 | - |
| U2 | `validateConfig` | `{}` | call | throws `ConfigError` naming `qualities` (there are no default qualities; see #1) | #1 |
| U3 | `validateConfig` | `it.each` over avif q 0/101, webp q 0/101, effort.avif 0/10, effort.webp 0/7, blurSize 3/65, blurQuality 0/101, minSize -1 | call | throws `ConfigError`; `messages` has exactly one entry and it names the field | - |
| U4 | `validateConfig` | boundaries: q 1 and 100, effort.avif 9, effort.webp 6, blurSize 4 and 64 | call | does not throw; values are kept | - |
| U5 | `validateConfig` | quality without effort, and effort without quality, for each format (4 cases) | call | `ConfigError`; the message names the missing key | - |
| U6 | `validateConfig` | unsorted breakpoints + duplicate deviceSizes + descending imageSizes | call | `messages.length === 3` (errors are aggregated) | - |
| U7 | `validateConfig` | `concurrency: -1`, `concurrency: 1.5`, `deviceSizes: [-10, 100]`, `paths.input: ''` | call | `ConfigError` | #13 |
| U8 | `utils/hash.ts:getFileHash` | temp file containing `abc` | call | `=== 'ba7816bf'`; a different content gives a different hash | - |
| U9 | `getFileHash` | files of 1 MiB and 1 MiB + 1 B (stream path) | call | equals `sha256(buffer).slice(0,8)` for both | - (fe70b80) |
| U10 | `getFileHash` | missing path | call | promise rejects with `ENOENT` | - |
| U11 | `getConfigHash` | same config twice; then `qualities.webp` changed | call | first pair equal; changed config differs; result matches `/^[0-9a-f]{8}$/` | - |
| U12 | `getConfigHash` | the same object with keys in reverse order | call | hashes are equal | #4 |
| U13 | `getConfigHash` | configs that differ only in `concurrency` | call | hashes are equal | #4 |
| U14 | `getConfigHash` | default version argument | call | equals `getConfigHash(cfg, pkg.version)` (version not hard-coded) | #4 |
| U15 | `generateCompositeHash` | `('aaaaaaaa','bbbbbbbb')` | call | `'aaaaaaaa-bbbbbbbb'` | - |
| U16 | `utils/paths.ts:normalizePath`/`getRelativePath` | input built with `path.join('a','b','c')` | call | `'a/b/c'`; relative path `'sub/x.png'` | - |
| U17 | `getOutputPath` | `(in/sub/x.png, in, out, 'h', ext)` for ext `''`, `'webp'`, `'.webp'` | call | `out/sub/x-h`, `out/sub/x-h.webp`, `out/sub/x-h.webp` | - |
| U18 | `utils/fs-helpers.ts:cleanOldVersions` | dir with `hero-<cur>/`, `hero-<cur>.meta.json`, `hero-<old>/`, `hero-<old>.meta.json`, `hero-dark-<x>/` | `('hero', cur)` | only the `<old>` dir and meta are removed; `hero-dark-*` survives | - |
| U19 | `cleanOldVersions` | non-existent dir | call | resolves without throwing | - |
| U20 | `getFiles` | nested `a/b/c.png`, `d.png`, empty dir `e/` | call | exactly 2 absolute file paths; no directories | - |
| U21 | `sanitizeVarName` (R1) | `hero-image`, `1st`, `a.b c` | call | `hero_image`, `_1st`, `a_b_c` | - |
| U22 | `sanitizeVarName` | `class`, `default`, `new` | call | result is a valid identifier and not a reserved word (checked with `ts.stringToToken`/scanner) | #7 |
| U23 | `toPublicUrl` (R2) | `<root>/public/next-granular-images/a/x.webp` | call | `/next-granular-images/a/x.webp` | - |
| U24 | `toPublicUrl` | root is `/home/u/public/app`; file `<root>/public/ngi/x.webp` | call | `/ngi/x.webp` (the right `public`, not the first one) | #8 |
| U25 | `toPublicUrl` | file outside `publicRoot` (output `static/ngi`) | call | throws a descriptive error; never returns an absolute fs path | #8 |
| U26 | `buildSrcSet` (R2) | `{640:'…/a-640.webp', 16:'…/a-16.webp'}`; also `{}` | call | `'/…/a-16.webp 16w, /…/a-640.webp 640w'` (ascending); `{}` gives `undefined` | - |
| U27 | `isProcessableImage` (R3) | `.png .jpg .jpeg .tiff .gif`, plus `.svg .webp .avif .ico` with the default exclusions | call | the first group is true, the second false | - |
| U28 | `isProcessableImage` | `HERO.PNG`; user exclusion `'.SVG'` against `logo.svg` | call | `HERO.PNG` is true; `logo.svg` is excluded (case-insensitive match) | #6 |
| U29 | `isProcessableImage` | outputDir `public/next-granular-images`; files in it and in `public/next-granular-images-old/x.png` | call | inside is false; the sibling `-old` is true | #11 |
| U30 | `isProcessableImage` | exclusion `'.min.png'` | `a.min.png`, `a.png` | false, true | - |
| U31 | `isProcessableImage` | `photo.heic` | call | false (not supported by prebuilt sharp) | #6 |
| U32 | `computeTargetWidths` (R4) | deviceSizes `[16,100]`, imageSizes `[16,32]`, width 150 | call | `[16,32,100]`: deduped, ascending, capped at width | #6 |
| U33 | `pickClosestWidth` (R5) | widths `[100,200,400]`, targets 150/310/1000 | call | 100 (tie goes to lower), 400, 400 | - |
| U34 | `summarizeSavings` (R5) | `{sm:{original:0,optimized:0}}` and a 50 % case | call | `'0%'`; `'50.0%'`; MB strings rounded to 2 decimals | #15 |
| U35 | `Logger` (R6) | `new Logger()` with `LOG_LEVEL=verbose`; spy on `console.error` | `.error('x')` | `console.error` is called once | #14 |
| U36 | `core/queue.ts` | fresh module (`vi.resetModules`); then `initializeQueue({concurrency:2})` with 5 deferred tasks | `addToQueue` | throws `Queue not initialized` before init; at most 2 tasks in flight; `getQueueStats().concurrency === 2` | - |

## 2. Pipeline with real sharp (`tests/pipeline`, node, 30 s timeout): 15 tests

Fixture helper `tests/helpers/images.ts` generates:
- `red.jpg`: 800x400, RGB (200,30,30)
- `rotated.jpg`: 40x20 raw, `withMetadata({orientation: 6})`, so it displays as 20x40
- `alpha.png`: 64x64, RGBA, alpha 0.5
- `anim.gif`: 32x32, via `.gif()`
- `small.png`: 150x75
- `bad.png`: text bytes

P1 to P7 call `processImage` directly after `initializeQueue`. P8 onward call `optimize({}, { cwd })` in-process (R7) on a temp project `public/images/*`.

| ID | Target | Setup | Action | Assertion | Bug |
|---|---|---|---|---|---|
| P1 | `core/processor.ts:processImage` | `red.jpg` | process | `Object.keys(variants.webp)` = `16,32,100,200,400`; every file exists; `sharp(file).metadata()` gives `format:'webp'` and `width === key` | - |
| P2 | `processImage` | `red.jpg` | process | the avif files have `format:'heif'`, `compression:'av1'`, and the right widths | - |
| P3 | `processImage` | `small.png` (150 wide) | process | widths are `16,32,100`; nothing wider than the source | - |
| P4 | `processImage` | `red.jpg` | process | `variants.original` bytes equal the source bytes | - |
| P5 | `processImage` | `red.jpg`, blurSize 10 | process | `blurDataURL` starts with `data:image/jpeg;base64,`; decoded width ≤ 10; `dominantColor` matches `/^rgb\(\d+,\d+,\d+\)$/` with r>150, g<80 | - |
| P6 | `processImage` | `alpha.png` | process | `hasAlpha` is true; blur starts with `data:image/webp`; `dominantColor` is undefined | - |
| P7 | `processImage` | `rotated.jpg` | process | `originalWidth` 20, `originalHeight` 40; the 16w webp has height 32 | #5 |
| P8 | `processImage` | `anim.gif` | process | `variants.avif` and `variants.webp` are empty; the original is copied (matches the CHANGELOG "passthrough") | #6 |
| P9 | `processImage` | `small.png`, `minSizeToOptimize: 10_000` | process | only the original exists; variants are empty; `blurDataURL` is undefined | - |
| P10 | `processImage` | `bad.png` | process | rejects with an `Error`; no half-written variant files remain | - |
| P11 | `commands/optimize.ts:optimize` | `images/hero.jpg` | run | the meta file matches `out/images/hero-[0-9a-f]{8}-[0-9a-f]{8}.meta.json`; parsed `originalWidth` is 800 | - |
| P12 | `optimize` | same as P11 | run | no string value in the meta JSON contains the temp root or matches `^([A-Za-z]:[\\/]|/)` (no absolute paths) | #9 |
| P13 | `optimize` | run twice | second run | the logger spy sees `Processed: 0` and `Cached: 1`; variant `mtimeMs` is unchanged | - |
| P14 | `optimize` | run, overwrite `hero.jpg` with a new colour, run again | second run | exactly one `hero-*.meta.json` and one `hero-*` dir; the file hash changed | - |
| P15 | `optimize` | run; change `qualities.webp` 50→60 and run; separately change only `concurrency` 4→2 and run | second runs | quality change → new cfg hash and old artefacts removed; concurrency-only change → `Cached: 1` | #4 |

## 3. Type generation (`tests/typegen`, node): 9 tests

Compile helper: `ts.createProgram([gen, consumer], { strict: true, noEmit: true, jsx: 'react-jsx', moduleResolution: Bundler, paths: { 'next-granular-images': ['src/client/index.ts'] } })`, then assert that `ts.getPreEmitDiagnostics` is empty. Export names come from `checker.getExportsOfModule`. Values are read by a dynamic `import()` of the generated `.ts` (Vitest transforms it).

| ID | Target | Setup | Action | Assertion | Bug |
|---|---|---|---|---|---|
| T1 | `core/generator.ts:generateTypeScriptFile` | synthetic `ProcessedImageResult` for `hero`, `logo` (public paths); consumer does `const g: GeneratedImage = hero; const b: string = hero_blur; <NextGranularImage src={hero} alt="" placeholder={hero_blur}/>` | generate + compile | 0 diagnostics | - |
| T2 | same | same | exports | names are exactly `['hero','hero_blur','logo','logo_blur']` | - |
| T3 | same | avif disabled (empty map) | import | `hero.src` starts with `/next-granular-images/`; `hero.width` is 800; `hero.variants.webp` contains `400w`; `hero.variants.avif === undefined`; `hero.dominantColor` is an rgb string | - |
| T4 | same | name `it's`, relativePath containing `*/`, src containing `"` and `\` | generate + compile + import | 0 diagnostics; `src` round-trips exactly | #7 |
| T5 | same | images `class`, `default` | compile | 0 diagnostics; 4 distinct exports | #7 |
| T6 | same | `hero-image` and `hero_image` in one dir | compile | 0 diagnostics; 4 distinct exports | #7 |
| T7 | `generateConfigTypes` | breakpoints `{sm:640,'2xl':1536}`; consumer builds `ArtDirectionSrc` with `'2xl'`, plus one with `foo` | compile | the valid consumer has 0 diagnostics; `foo` gives exactly 1 excess-property diagnostic | - |
| T8 | `optimize` + generator | real run with `a.jpg`, `sub/b.jpg`; delete `sub/b.jpg`; run again | read types dir | `sub/images.gen.ts` is gone; root file exports only `a`, `a_blur` | #12 |
| T9 | `commands/generate.ts:generate` | valid meta plus one corrupt `x.meta.json`; types dir deleted | generate | resolves; a warning is logged; valid images are still exported | #3 |

## 4. CLI integration (`tests/cli`, node, 60 s timeout): 18 tests

`globalSetup` runs `tsup` once. Each test creates a temp project with `package.json` and `next-granular-images.config.js` (`module.exports = {...}`; C1 uses `.ts`). It runs `spawnSync(process.execPath, [dist/cli/index.js, ...args], { cwd, env })` and asserts `status`, stdout/stderr, and files.

| ID | Command | Setup | Assertion | Bug |
|---|---|---|---|---|
| C1 | `init` | empty dir | exit 0; config `.ts` exists and `validateConfig(jiti(config))` does not throw; a second `init` exits 0 and leaves the content byte-identical | - |
| C2 | `init --build fast` | `src/assets/a.jpg` | exit 0; only `.webp` variants under the output dir | - |
| C3 | `optimize` | 2 JPEGs in `public/images` | exit 0; meta, avif and webp variants, `config.d.ts`, `images/images.gen.ts` exist; stdout has `Processed: 2` | - |
| C4 | `optimize` | 1 valid + `bad.png` | exit ≠ 0; the valid image's outputs still exist; stderr names `bad.png` | #2 |
| C5 | `optimize` | no config file, `public/a.jpg` | exit 1; stderr points to `npx next-granular-images init`; nothing is written | #1 |
| C6 | `optimize` | `qualities.webp: 150` | exit 1; stderr contains `qualities.webp must be an integer between 1 and 100` | - |
| C7 | `optimize` | `paths.input: 'missing'` | exit 1; stderr contains `Input directory not found` | - |
| C8 | `optimize` | `a.png` and a byte copy `b.png`; separately `hero.png` + `hero.jpg` | exit 1 for both; stderr contains `Duplicate image content` / `Duplicate image names` | - |
| C9 | `foo`, and no args | - | exit 1; stdout contains `Unknown command` | - |
| C10 | `optimize --fast` | 1 JPEG | exit 0; no `.avif` file anywhere in the output | - |
| C11 | `optimize --fast`, then delete the types dir, then `generate` | 1 JPEG | exit 0 for both; `images.gen.ts` exports `hero` | #3 |
| C12 | `generate` | no output dir | exit 1; stderr contains `Output directory not found` | - |
| C13 | `generate --breakpoints` | after `optimize`, delete the types dir | `config.d.ts` exists; no `images.gen.ts` | - |
| C14 | `clean` / `clean --all` | after `optimize` | output and types dirs removed; config kept / config removed | - |
| C15 | `clean --image` | images at root and in `sub/` | no `images.gen.ts` anywhere under types; `config.d.ts` kept | #10 |
| C16 | `clean` | output `public/out` (no `next-granular-images` in path) | exit 0; `public/out` still exists; stderr contains `Safety check failed` | - |
| C17 | `clean` | invalid config (`qualities.webp: 0`) | exit 0 with the `Could not load configuration` warning (no hard exit from the loader) | #10 |
| C18 | `optimize` with `LOG_LEVEL=bogus`, and `node dist/cli/index.mjs optimize` | invalid config / valid config | the bogus level still prints the error on stderr; the ESM entry exits 0 | #14, #16 |

## 5. React components (`tests/react`, jsdom): 14 tests

Fixtures: `img(name, {avif?, webp?, ext?})` returns a `GeneratedImage`. Renders use `@testing-library/react`. Assertions read DOM attributes.

| ID | Target | Setup | Assertion | Bug |
|---|---|---|---|---|
| X1 | `NextGranularImage` | single image with avif + webp | one `<picture>`; `<source>` types in order `image/avif`, `image/webp`; `srcset` values match the variants; `img` has `src`, `alt`, `width`, `height` | - |
| X2 | same | webp only | exactly one `<source type="image/webp">` | - |
| X3 | same | `.gif` src | 0 `<source>`; `img.src` ends with `.gif` | - |
| X4 | same | `{default, md, xl}` | `media` list in order: `(min-width: 1280px)`×3, `(min-width: 768px)`×3, then 2 sources with no media; `img` has no width/height | - |
| X5 | same | `customBreakpoints {md:900,'2xl':1536}` with `2xl`, `md` | `2xl` sources come first with `1536px`; `md` uses `900px` | - |
| X6 | same | art direction without `default`; `console.error` spy | container is empty; spy called once | - |
| X7 | same | `src={null as any}` | container is empty | - |
| X8 | same | `sizes="50vw"` | every `<source>` and the `img` have `sizes="50vw"` | - |
| X9 | same | `placeholder="data:image/jpeg;base64,AA"` vs `null` | with a placeholder: a `.granular-blur-placeholder` whose background contains the URL, `img[data-granular-flow]`, img opacity `0`. Without: no blur div, no data attr, opacity `1` | - |
| X10 | same | defaults vs `loading="eager"`, `id`, `data-testid`, `onLoad` spy | defaults `loading=lazy`, `decoding=async`; overrides applied; `fireEvent.load(img)` calls the spy | - |
| X11 | same | single vs art direction | `img.style.aspectRatio` is `800 / 400` for single; empty for art direction | - |
| X12 | `NextGranularImage` reveal | image with a placeholder, with and without `<GranularBlurFix/>` (now a no-op); `fireEvent.load` / `fireEvent.error`, also on an img rendered into a detached root | blur opacity `0`, img opacity `1`; user `onLoad`/`onError` still called; stays revealed after a parent re-render | - |
| X13 | `NextGranularImage` reveal | `img.complete` stubbed true at mount and at hydration of server markup | image revealed; no hydration warnings | - |
| X14 | `NextGranularImage` | React 18.3.1; `console.error` spy | default render logs no unknown-prop warning for `fetchPriority` | #17 |

The `#17` items were approved on 2026-09-29 and have tests: `className`/`style` style only the wrapper and the new `imgClassName`/`imgStyle` style the `<img>`; the `<img>` is visible without JavaScript and paints above the placeholder (no `z-index:-1`); generated images carry the config breakpoints, which the component uses at runtime (`customBreakpoints` still wins).

## Dev dependencies (checked with `npm view <pkg> time` on 2026-09-29; all ≥ 7 days old)

| Package | Version | Released | Note |
|---|---|---|---|
| vitest | 4.1.11 | 2026-08-18 | Same major as the current pin (4.0.16). 5.0.1 (09-15) is also eligible. |
| @vitest/coverage-v8 | 4.1.11 | 2026-08-18 | Must match vitest. |
| @testing-library/react | 16.3.3 | 2026-08-27 | |
| @testing-library/dom | 10.4.2 | 2026-09-13 | Peer of RTL 16. |
| jsdom | 27.4.0 | 2025-12-26 | 30.x needs Node ≥ 22.22; to verify against the CI Node matrix. |
| react / react-dom | 18.3.1 | 2024-04-26 | The lowest supported peer, which exposes #17. An optional CI job runs React 19.3.0 (09-09). |
| @types/react (bump) / @types/react-dom | 18.3.31 / 18.3.7 | 2026-06-05 / 2025-04-30 | |
| sharp | 0.33.5 | 2024-08-16 | Matches the peer `^0.33.0`. 0.34.5 / 0.35.4 go in a separate peer-range decision (#16). |
| typescript (pin) | 5.9.3 | 2025-09-30 | The compiler API is used in §3. TS 7 (native) has no stable JS API. |
| tsup (pin) | 8.5.1 | 2025-11-12 | Builds the CLI in `globalSetup`. |

## Vitest config and scripts

`vitest.config.ts` uses `test.projects`:
- `unit`: `tests/unit/**`, env `node`
- `pipeline`: `tests/pipeline/**`, env `node`, `pool: 'forks'` (sharp/libvips is safer outside worker threads), `testTimeout: 30_000`
- `typegen`: `tests/typegen/**`, env `node`, `testTimeout: 30_000`
- `cli`: `tests/cli/**`, env `node`, `pool: 'forks'`, `globalSetup: tests/cli/build.ts`, `testTimeout: 60_000`
- `react`: `tests/react/**`, env `jsdom`, `setupFiles: tests/react/setup.ts` (RTL `cleanup`)

Coverage: provider `v8`, `include: ['src/**']`, `exclude: ['src/cli/index.ts', 'src/types/**']`. Thresholds for `src/cli/core/**`, `src/cli/utils/**`, `src/client/**`: lines/statements 85 %, branches 80 %, functions 85 %. For `src/cli/commands/**` (measured in-process through R7): lines 70 %. Subprocess CLI runs are not counted.

Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:unit": "vitest run --project unit"`, `"test:pipeline": "vitest run --project pipeline"`, `"test:types": "vitest run --project typegen"`, `"test:cli": "vitest run --project cli"`, `"test:react": "vitest run --project react"`, `"test:coverage": "vitest run --coverage"`, `"typecheck": "tsc --noEmit"`.

## Suspected bugs: patch vs needs approval

| Bug | Class | Notes |
|---|---|---|
| #1 | needs approval | Either pick default qualities (new public defaults), or turn the "Using defaults" path into a clear error pointing to `init`. Both change behaviour. |
| #2 | patch | A non-zero exit on failure; note in CHANGELOG (builds that silently passed will now fail). |
| #3 | patch | `generate` finds metas by name pattern, not by recomputed hash; guarded parse; remove the dead loop. |
| #4 | patch | Stable key order, drop `concurrency`, use the pkg version. One-time cache bust; note it. |
| #5 | patch | Read dimensions after `rotate()`. Generated width/height for rotated images become correct. |
| #6 | split | Width dedupe and case-insensitive ext/exclusions: **patch**. GIF passthrough (fix code vs fix CHANGELOG) and dropping `.heic`: **approval**. |
| #7 | patch | Escaping via `JSON.stringify`, reserved-word and collision suffixing. Output that did not compile starts compiling. |
| #8 | split | Last/matching `public` segment: **patch**. Output outside `public` (error vs new `publicPath` option): **approval**. |
| #9 | patch | Meta stores relative paths. Internal cache format; old metas are treated as a miss. |
| #10 | patch | Remove root `images.gen.ts`; loader throws instead of exiting; add a `--images` alias (additive). |
| #11 | patch | Separator-aware prefix check. |
| #12 | patch | Remove stale generated files the tool owns. |
| #13 | split | Reject values that crash (negative/non-integer concurrency, negative sizes): **patch**. Stricter rejection of configs that currently work: **approval**. |
| #14 | patch | Fall back to `info` on an invalid `LOG_LEVEL`; the generator uses `logger`. |
| #15 | patch | Report-only math. |
| #16 | split | ESM `__filename` and p-queue CJS interop: **patch**. Adding `engines` / widening the sharp peer: **approval**. |
| #17 | split | `fetchPriority` on React 18: **patch**. className/style placement, no-JS visibility, z-index, runtime breakpoints: **approval**. |
| #18 | patch | Tooling only (eslint config, `typecheck`, `case` block). |

Totals: 12 patch, 1 needs approval, 5 split (each has a patch part and an approval part).

### Decisions (2026-09-29)

Every approval-gated part above was approved, so no test ships as `it.fails`:

- #1: a missing config is an error that points to `init`. No default qualities are invented.
- #6: GIFs are copied as-is (no AVIF/WebP). `.heic` is dropped: the prebuilt sharp binaries have no HEVC decoder.
- #8: `paths.output` outside `public/` is a config error.
- #13: non-integer qualities/efforts/blur settings, empty paths and non-string exclusions are rejected too.
- #16: `engines.node >=20.19.0`; the sharp peer is `^0.33.0 || ^0.34.0` and CI runs both.
- #17: see the note under section 5.
