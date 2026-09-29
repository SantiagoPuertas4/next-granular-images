import zlib from 'zlib';
import sharp from 'sharp';
import { photoPixels } from './images';

/**
 * Builders that plant a unique secret string in every place an image
 * container can hide metadata, to check the public original carries none.
 */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (data: Buffer): number => {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

/** Little-endian TIFF/EXIF block with an Artist tag and a GPS IFD pointer. */
export const exifBlock = (secret: string): Buffer => {
  const text = Buffer.from(`${secret}\0`, 'latin1');
  const header = Buffer.alloc(8 + 2 + 2 * 12 + 4);
  header.write('II', 0, 'latin1');
  header.writeUInt16LE(42, 2);
  header.writeUInt32LE(8, 4);
  header.writeUInt16LE(2, 8);
  // Artist (315), ASCII, stored after the IFD.
  header.writeUInt16LE(315, 10);
  header.writeUInt16LE(2, 12);
  header.writeUInt32LE(text.length, 14);
  header.writeUInt32LE(header.length, 18);
  // GPS IFD pointer (34853), pointing past the end: only its presence matters.
  header.writeUInt16LE(34853, 22);
  header.writeUInt16LE(4, 24);
  header.writeUInt32LE(1, 26);
  header.writeUInt32LE(0, 30);
  return Buffer.concat([header, text]);
};

// ============================================================================
// JPEG
// ============================================================================

export const jpegSegment = (marker: number, data: Buffer | string): Buffer => {
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1');
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
};

/** Every JPEG location the stripper removes, each with its own secret. */
export const JPEG_SECRETS = {
  exif: 'SECRET_JPEG_EXIF',
  xmp: 'SECRET_JPEG_XMP',
  xmpExtension: 'SECRET_JPEG_XMPEXT',
  fpxr: 'SECRET_JPEG_FPXR',
  mpf: 'SECRET_JPEG_MPF',
  app3: 'SECRET_JPEG_APP3',
  iptc: 'SECRET_JPEG_IPTC',
  app15: 'SECRET_JPEG_APP15',
  comment: 'SECRET_JPEG_COM',
  trailer: 'SECRET_JPEG_TRAILER',
} as const;

/** Segments inserted right after SOI, one per removable location. */
export const jpegMetadataSegments = (): Buffer =>
  Buffer.concat([
    jpegSegment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), exifBlock(JPEG_SECRETS.exif)])),
    jpegSegment(0xe1, `http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>${JPEG_SECRETS.xmp}</x:xmpmeta>`),
    jpegSegment(0xe1, `http://ns.adobe.com/xmp/extension/\0${JPEG_SECRETS.xmpExtension}`),
    jpegSegment(0xe2, `FPXR\0${JPEG_SECRETS.fpxr}`),
    jpegSegment(0xe2, `MPF\0${JPEG_SECRETS.mpf}`),
    jpegSegment(0xe3, JPEG_SECRETS.app3),
    jpegSegment(0xed, `Photoshop 3.0\x008BIM\x04\x04\0\0\0\0\0\x10${JPEG_SECRETS.iptc}`),
    jpegSegment(0xef, JPEG_SECRETS.app15),
    jpegSegment(0xfe, JPEG_SECRETS.comment),
  ]);

/** `jpeg` with every JPEG secret planted: segments after SOI, a trailer after EOI. */
export const plantJpegSecrets = (jpeg: Buffer): Buffer =>
  Buffer.concat([
    jpeg.subarray(0, 2),
    jpegMetadataSegments(),
    jpeg.subarray(2),
    Buffer.from(JPEG_SECRETS.trailer, 'latin1'),
  ]);

/** A photo-like JPEG with a Display P3 ICC profile and no other metadata. */
export const iccJpeg = (options: sharp.JpegOptions = {}): Promise<Buffer> =>
  photoPixels(96, 64).jpeg(options).withIccProfile('p3').toBuffer();

// ============================================================================
// PNG
// ============================================================================

export const pngChunk = (type: string, data: Buffer | string): Buffer => {
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
};

export const PNG_SECRETS = {
  text: 'SECRET_PNG_TEXT',
  itext: 'SECRET_PNG_ITXT',
  exif: 'SECRET_PNG_EXIF',
  private: 'SECRET_PNG_PRIVATE',
  trailer: 'SECRET_PNG_TRAILER',
} as const;

/** Offset right after the IHDR chunk (signature + 25-byte IHDR). */
const AFTER_IHDR = 33;

/**
 * `png` with text, EXIF, time and private chunks after IHDR and a trailer
 * after IEND. zTXt compresses its text, so it is checked by chunk type.
 */
export const plantPngSecrets = (png: Buffer): Buffer =>
  Buffer.concat([
    png.subarray(0, AFTER_IHDR),
    pngChunk('tEXt', `Author\0${PNG_SECRETS.text}`),
    pngChunk('iTXt', `Author\0\0\0\0\0${PNG_SECRETS.itext}`),
    pngChunk('zTXt', Buffer.concat([Buffer.from('Author\0\0', 'latin1'), zlib.deflateSync('SECRET_PNG_ZTXT')])),
    pngChunk('eXIf', exifBlock(PNG_SECRETS.exif)),
    pngChunk('tIME', Buffer.from([0x07, 0xe6, 1, 2, 3, 4, 5])),
    pngChunk('prVt', PNG_SECRETS.private),
    png.subarray(AFTER_IHDR),
    Buffer.from(PNG_SECRETS.trailer, 'latin1'),
  ]);

/** Chunk types of a PNG, in order. */
export const pngChunkTypes = (png: Buffer): string[] => {
  const types: string[] = [];
  for (let offset = 8; offset + 8 <= png.length; ) {
    const length = png.readUInt32BE(offset);
    types.push(png.toString('latin1', offset + 4, offset + 8));
    offset += 12 + length;
  }
  return types;
};

/** The chunks of a PNG (without signature) from IHDR's end up to, not including, IEND. */
const pngBody = (png: Buffer) => {
  const chunks: { type: string; data: Buffer; raw: Buffer }[] = [];
  for (let offset = 8; offset + 8 <= png.length; ) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    chunks.push({ type, data: png.subarray(offset + 8, offset + 8 + length), raw: png.subarray(offset, offset + 12 + length) });
    offset += 12 + length;
  }
  return chunks;
};

/**
 * Two-frame APNG built from two same-sized PNGs: frame one is the default
 * image (IDAT), frame two is carried in fdAT.
 */
export const makeApng = async (): Promise<Buffer> => {
  const frame = (r: number) =>
    sharp({ create: { width: 16, height: 16, channels: 3, background: { r, g: 40, b: 40 } } })
      .png({ adaptiveFiltering: false, palette: false })
      .toBuffer();
  const [first, second] = [pngBody(await frame(220)), pngBody(await frame(20))];
  const ihdr = first.find((c) => c.type === 'IHDR')!;
  const fcTL = (sequence: number) => {
    const data = Buffer.alloc(26);
    data.writeUInt32BE(sequence, 0);
    data.writeUInt32BE(16, 4);
    data.writeUInt32BE(16, 8);
    data.writeUInt16BE(1, 20);
    data.writeUInt16BE(10, 22);
    return pngChunk('fcTL', data);
  };
  const acTL = Buffer.alloc(8);
  acTL.writeUInt32BE(2, 0);
  const fdAT = second
    .filter((c) => c.type === 'IDAT')
    .map((c, i) => {
      const sequence = Buffer.alloc(4);
      sequence.writeUInt32BE(2 + i);
      return pngChunk('fdAT', Buffer.concat([sequence, c.data]));
    });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ihdr.raw,
    pngChunk('acTL', acTL),
    fcTL(0),
    ...first.filter((c) => c.type === 'IDAT').map((c) => c.raw),
    fcTL(1),
    ...fdAT,
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

// ============================================================================
// WebP
// ============================================================================

export const webpChunk = (type: string, data: Buffer | string): Buffer => {
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1');
  const head = Buffer.alloc(8);
  head.write(type, 0, 'latin1');
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
};

export const riff = (...chunks: Buffer[]): Buffer => {
  const body = Buffer.concat(chunks);
  const head = Buffer.from('RIFF\0\0\0\0WEBP', 'latin1');
  head.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([head, body]);
};

/** The chunks of a WebP file, without the RIFF header. */
export const webpChunks = (webp: Buffer): { type: string; data: Buffer; raw: Buffer }[] => {
  const chunks: { type: string; data: Buffer; raw: Buffer }[] = [];
  const end = 8 + webp.readUInt32LE(4);
  for (let offset = 12; offset + 8 <= end; ) {
    const type = webp.toString('latin1', offset, offset + 4);
    const size = webp.readUInt32LE(offset + 4);
    const next = offset + 8 + size + (size % 2);
    chunks.push({ type, data: webp.subarray(offset + 8, offset + 8 + size), raw: webp.subarray(offset, next) });
    offset = next;
  }
  return chunks;
};

export const WEBP_SECRETS = {
  exif: 'SECRET_WEBP_EXIF',
  xmp: 'SECRET_WEBP_XMP',
  unknown: 'SECRET_WEBP_UNKNOWN',
  trailer: 'SECRET_WEBP_TRAILER',
} as const;

const plantedWebpChunks = () => [
  webpChunk('EXIF', exifBlock(WEBP_SECRETS.exif)),
  webpChunk('XMP ', `<x:xmpmeta>${WEBP_SECRETS.xmp}</x:xmpmeta>`),
  webpChunk('zzzz', WEBP_SECRETS.unknown),
];

/** Simple-format WebP (no VP8X) with EXIF/XMP/unknown chunks after the image and bytes past the RIFF size. */
export const plantSimpleWebpSecrets = (webp: Buffer): Buffer =>
  Buffer.concat([riff(...webpChunks(webp).map((c) => c.raw), ...plantedWebpChunks()), Buffer.from(WEBP_SECRETS.trailer)]);

const VP8X_ICC = 0x20;
const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

/**
 * Extended WebP: VP8X (EXIF and XMP flags set), an ICC profile, the image,
 * then EXIF, XMP and an unknown chunk, plus bytes past the RIFF size.
 */
export const plantExtendedWebpSecrets = (webp: Buffer, icc?: Buffer): Buffer => {
  const image = webpChunks(webp).filter((c) => c.type !== 'VP8X' && c.type !== 'ICCP' && c.type !== 'EXIF' && c.type !== 'XMP ');
  const { width, height } = vp8Size(webp);
  const vp8x = Buffer.alloc(10);
  vp8x[0] = VP8X_EXIF | VP8X_XMP | (icc ? VP8X_ICC : 0);
  vp8x.writeUIntLE(width - 1, 4, 3);
  vp8x.writeUIntLE(height - 1, 7, 3);
  return Buffer.concat([
    riff(
      webpChunk('VP8X', vp8x),
      ...(icc ? [webpChunk('ICCP', icc)] : []),
      ...image.map((c) => c.raw),
      ...plantedWebpChunks()
    ),
    Buffer.from(WEBP_SECRETS.trailer),
  ]);
};

/** Canvas size of a simple lossy (VP8) WebP. */
const vp8Size = (webp: Buffer) => {
  const vp8 = webpChunks(webp).find((c) => c.type === 'VP8 ');
  if (!vp8) throw new Error('not a simple lossy WebP');
  return { width: vp8.data.readUInt16LE(6) & 0x3fff, height: vp8.data.readUInt16LE(8) & 0x3fff };
};

/** Two-frame animated WebP (VP8X + ANIM + ANMF) with EXIF and XMP chunks. */
export const makeAnimatedWebp = async (): Promise<Buffer> => {
  const frame = async (r: number) => {
    const webp = await sharp({ create: { width: 16, height: 16, channels: 3, background: { r, g: 40, b: 40 } } })
      .webp({ quality: 90 })
      .toBuffer();
    return webpChunks(webp).find((c) => c.type === 'VP8 ')!.raw;
  };
  const anmf = (bitstream: Buffer) => {
    const head = Buffer.alloc(16);
    head.writeUIntLE(15, 6, 3);
    head.writeUIntLE(15, 9, 3);
    head.writeUIntLE(100, 12, 3);
    return webpChunk('ANMF', Buffer.concat([head, bitstream]));
  };
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x02 | VP8X_EXIF | VP8X_XMP;
  vp8x.writeUIntLE(15, 4, 3);
  vp8x.writeUIntLE(15, 7, 3);
  const anim = Buffer.alloc(6);
  return riff(
    webpChunk('VP8X', vp8x),
    webpChunk('ANIM', anim),
    anmf(await frame(220)),
    anmf(await frame(20)),
    webpChunk('EXIF', exifBlock(WEBP_SECRETS.exif)),
    webpChunk('XMP ', `<x:xmpmeta>${WEBP_SECRETS.xmp}</x:xmpmeta>`)
  );
};

/** True when `bytes` contains any of `secrets`. */
export const leaks = (bytes: Buffer, secrets: Record<string, string>): string[] =>
  Object.values(secrets).filter((secret) => bytes.includes(secret));
