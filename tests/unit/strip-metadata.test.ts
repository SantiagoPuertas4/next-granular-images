import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  heifHasMetadataItems,
  MalformedImageError,
  stripJpeg,
  stripPng,
  stripWebp,
} from '../../src/cli/core/strip-metadata';
import {
  iccJpeg,
  JPEG_SECRETS,
  jpegSegment,
  leaks,
  makeAnimatedWebp,
  makeApng,
  plantExtendedWebpSecrets,
  plantJpegSecrets,
  plantPngSecrets,
  plantSimpleWebpSecrets,
  PNG_SECRETS,
  pngChunk,
  pngChunkTypes,
  riff,
  WEBP_SECRETS,
  webpChunk,
  webpChunks,
} from '../helpers/metadata';
import { photoPixels } from '../helpers/images';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const pixels = (image: Buffer, options?: sharp.SharpOptions) => sharp(image, options).raw().toBuffer();

/** Stripping must lose no pixel, keep the colour profile and never grow the file. */
const expectLosslessStrip = async (source: Buffer, stripped: Buffer) => {
  expect((await pixels(stripped)).equals(await pixels(source))).toBe(true);
  const [before, after] = await Promise.all([sharp(source).metadata(), sharp(stripped).metadata()]);
  expect([after.width, after.height]).toEqual([before.width, before.height]);
  if (before.icc) expect(after.icc?.equals(before.icc)).toBe(true);
  expect(after.exif).toBeUndefined();
  expect(after.xmp).toBeUndefined();
  expect(after.iptc).toBeUndefined();
  expect(after.comments ?? []).toEqual([]);
  expect(stripped.length).toBeLessThanOrEqual(source.length);
};

describe('stripJpeg', () => {
  it.each([
    ['baseline', {}],
    ['progressive (several scans)', { progressive: true }],
  ] as const)('U50 removes every metadata location from a %s JPEG losslessly (RR-005)', async (_, options) => {
    const clean = await iccJpeg(options);
    const source = plantJpegSecrets(clean);
    expect(leaks(source, JPEG_SECRETS)).toEqual(Object.values(JPEG_SECRETS));
    const meta = await sharp(source).metadata();
    expect(meta.exif).toBeDefined();

    const stripped = stripJpeg(source);
    expect(leaks(stripped, JPEG_SECRETS)).toEqual([]);
    expect(stripped.equals(clean)).toBe(true);
    await expectLosslessStrip(source, stripped);
  });

  it('U51 returns a metadata-free JPEG byte for byte', async () => {
    const clean = await iccJpeg();
    expect(stripJpeg(clean).equals(clean)).toBe(true);
  });

  it('U52 keeps JFIF, Adobe and scan data with stuffing and restart markers, dropping fill bytes', () => {
    const jfif = jpegSegment(0xe0, 'JFIF\0\x01\x01\0\0\x01\0\x01\0\0');
    const adobe = jpegSegment(0xee, 'Adobe\0\x64\0\0\0\0\x01');
    const dqt = jpegSegment(0xdb, Buffer.alloc(65));
    const sos = jpegSegment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0]));
    const scan = Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0xd1, 0x78]);
    const soi = Buffer.from([0xff, 0xd8]);
    const eoi = Buffer.from([0xff, 0xd9]);
    const source = Buffer.concat([
      soi,
      jfif,
      jpegSegment(0xfe, 'SECRET'),
      adobe,
      dqt,
      sos,
      scan,
      Buffer.from([0xff, 0xff]), // fill bytes before the next marker
      jpegSegment(0xfe, 'SECRET'),
      sos,
      scan,
      eoi,
    ]);
    expect(stripJpeg(source)).toEqual(
      Buffer.concat([soi, jfif, adobe, dqt, sos, scan, sos, scan, eoi])
    );
  });

  it('U52b drops JFIF and JFXX thumbnails, keeping the JFIF header (RR-006)', async () => {
    const image = await iccJpeg();
    const jfifHeader = Buffer.from('JFIF\0\x01\x02\x01\x00\x48\x00\x48', 'latin1'); // version 1.2, 72 dpi
    const clean = Buffer.concat([image.subarray(0, 2), jpegSegment(0xe0, Buffer.concat([jfifHeader, Buffer.alloc(2)])), image.subarray(2)]);
    const jfifSecret = 'SECRET_JFIF_THUMB_'; // 18 bytes: a 6x1 RGB thumbnail
    const jfxxSecret = 'SECRET_JFXX_THUMB';
    const jfif = jpegSegment(0xe0, Buffer.concat([jfifHeader, Buffer.from([6, 1]), Buffer.from(jfifSecret)]));
    const jfxx = jpegSegment(0xe0, Buffer.concat([Buffer.from('JFXX\0\x10', 'latin1'), Buffer.from(jfxxSecret)]));
    const source = Buffer.concat([clean.subarray(0, 2), jfif, jfxx, clean.subarray(20)]);
    const secrets = { jfifSecret, jfxxSecret };
    expect(leaks(source, secrets)).toEqual([jfifSecret, jfxxSecret]);

    const stripped = stripJpeg(source);
    expect(leaks(stripped, secrets)).toEqual([]);
    expect(stripped.readUInt16BE(4)).toBe(16);
    expect([stripped[18], stripped[19]]).toEqual([0, 0]);
    expect(stripped.subarray(6, 18)).toEqual(jfifHeader);
    expect(stripped.equals(clean)).toBe(true);
    await expectLosslessStrip(source, stripped);
  });

  it.each([
    ['no SOI', Buffer.from('not a jpeg')],
    ['a segment running past the end', Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x10, 0x00, 1, 2])],
    ['a truncated segment length', Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x10])],
    ['bytes where a marker belongs', Buffer.from([0xff, 0xd8, 0x12, 0x34])],
    ['no EOI', Buffer.concat([Buffer.from([0xff, 0xd8]), jpegSegment(0xda, Buffer.alloc(6)), Buffer.from([1, 2, 3])])],
    ['EOI before any scan', Buffer.from([0xff, 0xd8, 0xff, 0xd9])],
    ['a nested SOI', Buffer.from([0xff, 0xd8, 0xff, 0xd8, 0xff, 0xd9])],
    ['a lone fill byte at the end', Buffer.from([0xff, 0xd8, 0xff])],
  ])('U53 throws on a JPEG with %s', (_, source) => {
    expect(() => stripJpeg(source)).toThrow(MalformedImageError);
  });

  it('U53b throws on a real JPEG cut short', async () => {
    const clean = await iccJpeg();
    expect(() => stripJpeg(clean.subarray(0, clean.length - 20))).toThrow(/Malformed JPEG/);
  });
});

describe('stripPng', () => {
  it.each([
    ['RGB with an ICC profile', () => photoPixels(64, 48).png().withIccProfile('p3').toBuffer()],
    ['palette', () => photoPixels(64, 48).png({ palette: true }).toBuffer()],
  ])('U54 removes text, EXIF, time, private chunks and trailers from a %s PNG (RR-004, RR-005)', async (_, make) => {
    const clean = await make();
    const source = plantPngSecrets(clean);
    expect(leaks(source, PNG_SECRETS)).toEqual(Object.values(PNG_SECRETS));

    const stripped = stripPng(source);
    expect(leaks(stripped, PNG_SECRETS)).toEqual([]);
    expect(pngChunkTypes(stripped).filter((t) => ['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME', 'prVt'].includes(t))).toEqual(
      []
    );
    expect(stripped.equals(clean)).toBe(true);
    await expectLosslessStrip(source, stripped);
  });

  it('U55 keeps every APNG animation chunk', async () => {
    const apng = await makeApng();
    const source = plantPngSecrets(apng);
    const stripped = stripPng(source);
    expect(stripped.equals(apng)).toBe(true);
    expect(pngChunkTypes(stripped)).toEqual(['IHDR', 'acTL', 'fcTL', 'IDAT', 'fcTL', 'fdAT', 'IEND']);
    expect((await pixels(stripped)).equals(await pixels(apng))).toBe(true);
  });

  it.each([
    ['no signature', () => Buffer.from('not a png at all')],
    ['a first chunk other than IHDR', () => Buffer.concat([PNG_SIG, pngChunk('IEND', '')])],
    ['a chunk running past the end', () => Buffer.concat([PNG_SIG, pngChunk('IHDR', Buffer.alloc(13)).subarray(0, 20)])],
    ['no IEND', () => Buffer.concat([PNG_SIG, pngChunk('IHDR', Buffer.alloc(13))])],
    [
      'a bad CRC',
      () => {
        const chunk = pngChunk('IHDR', Buffer.alloc(13));
        chunk[chunk.length - 1] ^= 0xff;
        return Buffer.concat([PNG_SIG, chunk, pngChunk('IEND', '')]);
      },
    ],
  ])('U56 throws on a PNG with %s', (_, make) => {
    expect(() => stripPng(make())).toThrow(MalformedImageError);
  });
});

describe('stripWebp', () => {
  const vp8xFlags = (webp: Buffer) => webpChunks(webp).find((c) => c.type === 'VP8X')?.data[0];

  it.each([
    ['lossy', { quality: 80 }],
    ['lossless', { lossless: true }],
  ] as const)('U57 removes EXIF/XMP/unknown chunks and trailers from a simple %s WebP (RR-005)', async (_, options) => {
    const clean = await photoPixels(64, 48).webp(options).toBuffer();
    expect(vp8xFlags(clean)).toBeUndefined();
    const source = plantSimpleWebpSecrets(clean);
    expect(leaks(source, WEBP_SECRETS)).toEqual(Object.values(WEBP_SECRETS));

    const stripped = stripWebp(source);
    expect(leaks(stripped, WEBP_SECRETS)).toEqual([]);
    expect(stripped.equals(clean)).toBe(true);
    await expectLosslessStrip(source, stripped);
  });

  it('U58 clears the EXIF/XMP flags of an extended WebP and keeps its ICC profile', async () => {
    const clean = await photoPixels(64, 48).webp({ quality: 80 }).toBuffer();
    const icc = (await sharp(await photoPixels(8, 8).jpeg().withIccProfile('p3').toBuffer()).metadata()).icc!;
    const source = plantExtendedWebpSecrets(clean, icc);
    expect(vp8xFlags(source)).toBe(0x2c);
    expect((await sharp(source).metadata()).exif).toBeDefined();

    const stripped = stripWebp(source);
    expect(leaks(stripped, WEBP_SECRETS)).toEqual([]);
    expect(vp8xFlags(stripped)).toBe(0x20);
    expect(webpChunks(stripped).map((c) => c.type)).toEqual(['VP8X', 'ICCP', 'VP8 ']);
    expect(stripped.readUInt32LE(4)).toBe(stripped.length - 8);
    await expectLosslessStrip(source, stripped);
  });

  it('U59 clears an ICC flag with no ICCP chunk behind it', async () => {
    const clean = await photoPixels(16, 16).webp({ quality: 80 }).toBuffer();
    const source = plantExtendedWebpSecrets(clean);
    const vp8x = webpChunks(source).find((c) => c.type === 'VP8X')!;
    vp8x.data[0] |= 0x20;
    expect(vp8xFlags(stripWebp(source))).toBe(0);
  });

  it('U60 keeps the frames of an animated WebP', async () => {
    const source = await makeAnimatedWebp();
    const stripped = stripWebp(source);
    expect(leaks(stripped, WEBP_SECRETS)).toEqual([]);
    expect(vp8xFlags(stripped)).toBe(0x02);
    expect(webpChunks(stripped).map((c) => c.type)).toEqual(['VP8X', 'ANIM', 'ANMF', 'ANMF']);
    const meta = await sharp(stripped, { animated: true }).metadata();
    expect([meta.pages, meta.exif, meta.xmp]).toEqual([2, undefined, undefined]);
    const animated = { animated: true } as const;
    expect((await pixels(stripped, animated)).equals(await pixels(source, animated))).toBe(true);
  });

  it('U61 keeps odd-sized chunks padded', async () => {
    const clean = await photoPixels(16, 16).webp({ quality: 80 }).toBuffer();
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x20;
    vp8x.writeUIntLE(15, 4, 3);
    vp8x.writeUIntLE(15, 7, 3);
    const icc = (await sharp(await photoPixels(8, 8).jpeg().withIccProfile('p3').toBuffer()).metadata()).icc!;
    const oddIcc = icc.length % 2 ? icc : Buffer.concat([icc, Buffer.from([0])]);
    const source = riff(webpChunk('VP8X', vp8x), webpChunk('ICCP', oddIcc), ...webpChunks(clean).map((c) => c.raw));
    const stripped = stripWebp(source);
    expect(stripped.equals(source)).toBe(true);
    expect(stripped.length % 2).toBe(0);
  });

  it.each([
    ['no RIFF header', () => Buffer.from('this is not a webp file at all')],
    ['a RIFF size past the end', () => Buffer.concat([riff(webpChunk('VP8L', Buffer.alloc(10))).subarray(0, 20), Buffer.alloc(2)])],
    ['a chunk past the RIFF size', () => {
      const file = riff(webpChunk('VP8L', Buffer.alloc(10)));
      file.writeUInt32LE(100, 16);
      return file;
    }],
    ['a truncated chunk header', () => riff(webpChunk('VP8L', Buffer.alloc(10)), Buffer.from('ICC'))],
    ['a first chunk that is not an image', () => riff(webpChunk('EXIF', Buffer.alloc(10)), webpChunk('VP8L', Buffer.alloc(10)))],
    ['a VP8X chunk that is too short', () => riff(webpChunk('VP8X', Buffer.alloc(4)))],
    ['no image data', () => riff(webpChunk('VP8X', Buffer.alloc(10)), webpChunk('ICCP', Buffer.alloc(4)))],
  ])('U62 throws on a WebP with %s', (_, make) => {
    expect(() => stripWebp(make())).toThrow(MalformedImageError);
  });
});

describe('heifHasMetadataItems', () => {
  const avif = (image: sharp.Sharp) => image.avif({ quality: 50, effort: 0 }).toBuffer();

  it('U63 finds the Exif item sharp writes and none in a plain AVIF', async () => {
    const plain = await avif(photoPixels(32, 32));
    const withExif = await avif(photoPixels(32, 32).withExif({ IFD0: { Artist: 'SECRET_AVIF' } }));
    expect(heifHasMetadataItems(plain)).toBe(false);
    expect(heifHasMetadataItems(withExif)).toBe(true);
  });

  it('U64 throws on a box running past the end of the file', async () => {
    const plain = await avif(photoPixels(32, 32));
    expect(() => heifHasMetadataItems(plain.subarray(0, 40))).toThrow(MalformedImageError);
  });
});
