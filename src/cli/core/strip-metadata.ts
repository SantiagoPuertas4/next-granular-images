/**
 * Byte-level metadata removal for the public copy of an original.
 *
 * Each stripper parses the container, copies the segments/chunks an image
 * needs to decode and look the same (pixels, colour profile, animation)
 * verbatim, and drops everything else: EXIF, XMP, comments, text chunks,
 * vendor blocks and bytes after the end of the image. No pixel is decoded or
 * re-encoded, so the result is lossless and never larger than the input.
 *
 * A file whose structure cannot be parsed throws instead of being copied
 * as-is, so unknown bytes never reach the output. The one tolerated defect
 * is a JPEG whose scan data runs to the end without EOI: the marker is added.
 */

export class MalformedImageError extends Error {
  constructor(format: string, reason: string) {
    super(`Malformed ${format}: ${reason}`);
    this.name = 'MalformedImageError';
  }
}

// ============================================================================
// JPEG
// ============================================================================

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0;
const APP2 = 0xe2;
const APP14 = 0xee;

const startsWith = (data: Buffer, start: number, end: number, signature: string): boolean =>
  end - start >= signature.length && data.toString('latin1', start, start + signature.length) === signature;

const isRst = (marker: number): boolean => marker >= 0xd0 && marker <= 0xd7;

/** Length of a JFIF APP0 segment without a thumbnail. */
const JFIF_LENGTH = 16;

/**
 * The bytes kept for a marker segment spanning `data[markerStart, end)`
 * (payload from `start`), or undefined to drop it. Kept: frame/scan structure
 * (SOFn, DHT, DAC, DQT, DRI, DNL, DHP, EXP), APP0 JFIF reduced to its header
 * (the embedded thumbnail could show the uncropped original), every APP2
 * ICC_PROFILE chunk and APP14 Adobe (colour transform). Everything else (APP0
 * JFXX thumbnails, APP1 EXIF/XMP, other APPn, COM...) is dropped.
 */
const keptJpegSegment = (
  marker: number,
  data: Buffer,
  markerStart: number,
  start: number,
  end: number
): Buffer | undefined => {
  const segment = data.subarray(markerStart, end);
  if (marker >= 0xc0 && marker <= 0xcf) return segment; // SOFn, DHT, JPG, DAC
  if (marker === 0xdb || marker === 0xdc || marker === 0xdd || marker === 0xde || marker === 0xdf) return segment;
  if (marker === APP0) {
    if (!startsWith(data, start, end, 'JFIF\0') || end - start < JFIF_LENGTH - 2) return undefined;
    // Keep version, units and density; drop the thumbnail and anything after it.
    const header = Buffer.from(data.subarray(markerStart, start + JFIF_LENGTH - 2));
    header.writeUInt16BE(JFIF_LENGTH, 2);
    header[header.length - 2] = 0; // Xthumbnail
    header[header.length - 1] = 0; // Ythumbnail
    return header;
  }
  if (marker === APP2) return startsWith(data, start, end, 'ICC_PROFILE\0') ? segment : undefined;
  if (marker === APP14) return startsWith(data, start, end, 'Adobe') ? segment : undefined;
  return undefined;
};

/**
 * End offset of the entropy-coded data that starts at `offset`: the next
 * marker, or the end of the buffer when the scan runs to it.
 */
const skipEntropyData = (data: Buffer, offset: number): number => {
  let i = offset;
  while (i < data.length) {
    if (data[i] !== 0xff) {
      i++;
      continue;
    }
    const next = data[i + 1];
    // A lone 0xFF at the very end is a truncated marker, left to the caller.
    if (next === undefined) return i;
    // Stuffed 0xFF00 and restart markers belong to the scan.
    if (next === 0x00 || isRst(next)) {
      i += 2;
      continue;
    }
    return i;
  }
  return data.length;
};

const EOI_MARKER = Buffer.from([0xff, EOI]);

export const stripJpeg = (data: Buffer): Buffer => {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== SOI) {
    throw new MalformedImageError('JPEG', 'missing SOI marker');
  }
  const parts: Buffer[] = [data.subarray(0, 2)];
  let offset = 2;
  let scans = 0;

  while (offset < data.length) {
    if (data[offset] !== 0xff) {
      throw new MalformedImageError('JPEG', `expected a marker at byte ${offset}`);
    }
    // Any number of 0xFF fill bytes may precede a marker.
    while (data[offset] === 0xff) offset++;
    if (offset >= data.length) break;
    const marker = data[offset];
    const markerStart = offset - 1;
    offset++;

    if (marker === EOI) {
      if (scans === 0) throw new MalformedImageError('JPEG', 'no image data before EOI');
      parts.push(data.subarray(markerStart, offset));
      // Anything after the primary image's EOI (trailers, appended data) is dropped.
      return Buffer.concat(parts);
    }
    if (marker === 0x01 || isRst(marker)) {
      // Standalone markers without a length.
      parts.push(data.subarray(markerStart, offset));
      continue;
    }
    if (marker === 0x00 || marker === SOI) {
      throw new MalformedImageError('JPEG', `unexpected marker 0x${marker.toString(16)} at byte ${markerStart}`);
    }
    if (offset + 2 > data.length) throw new MalformedImageError('JPEG', 'truncated segment length');
    const length = data.readUInt16BE(offset);
    const end = offset + length;
    if (length < 2 || end > data.length) {
      throw new MalformedImageError('JPEG', `segment 0x${marker.toString(16)} runs past the end of the file`);
    }

    if (marker === SOS) {
      const scanEnd = skipEntropyData(data, end);
      parts.push(data.subarray(markerStart, scanEnd));
      scans++;
      // Some encoders omit the final EOI: close the image instead of failing it.
      if (scanEnd === data.length) return Buffer.concat([...parts, EOI_MARKER]);
      offset = scanEnd;
      continue;
    }
    const kept = keptJpegSegment(marker, data, markerStart, offset + 2, end);
    if (kept) parts.push(kept);
    offset = end;
  }
  throw new MalformedImageError('JPEG', 'missing EOI marker');
};

// ============================================================================
// PNG
// ============================================================================

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Chunks kept: image data and structure, transparency, colour management
 * (iCCP, sRGB, gAMA, cHRM, sBIT, cICP), pixel density and APNG animation.
 * Text (tEXt/zTXt/iTXt), eXIf, tIME and private or unknown chunks are
 * dropped.
 */
const PNG_KEEP = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
  'iCCP',
  'sRGB',
  'gAMA',
  'cHRM',
  'sBIT',
  'cICP',
  'pHYs',
  'acTL',
  'fcTL',
  'fdAT',
]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (data: Buffer): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

export const stripPng = (data: Buffer): Buffer => {
  if (data.length < PNG_SIGNATURE.length || !data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new MalformedImageError('PNG', 'missing PNG signature');
  }
  const parts: Buffer[] = [data.subarray(0, 8)];
  let offset = 8;

  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString('latin1', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (length > 0x7fffffff || end > data.length) {
      throw new MalformedImageError('PNG', `chunk ${JSON.stringify(type)} runs past the end of the file`);
    }
    if (offset === 8 && type !== 'IHDR') throw new MalformedImageError('PNG', 'first chunk is not IHDR');
    if (crc32(data.subarray(offset + 4, end - 4)) !== data.readUInt32BE(end - 4)) {
      throw new MalformedImageError('PNG', `bad CRC in chunk ${JSON.stringify(type)}`);
    }
    if (PNG_KEEP.has(type)) parts.push(data.subarray(offset, end));
    // Bytes after IEND are dropped.
    if (type === 'IEND') return Buffer.concat(parts);
    offset = end;
  }
  throw new MalformedImageError('PNG', 'missing IEND chunk');
};

// ============================================================================
// WebP
// ============================================================================

/** Chunks kept (ANMF frames are filtered by stripAnmf); EXIF, XMP and unknown chunks are dropped. */
const WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ICCP']);
const WEBP_IMAGE = new Set(['VP8 ', 'VP8L', 'VP8X']);

const VP8X_ICC = 0x20;
const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

/** Sub-chunks of an animation frame that are kept; unknown ones are dropped. */
const ANMF_KEEP = new Set(['ALPH', 'VP8 ', 'VP8L']);
const ANMF_HEADER = 16;

/** The ANMF chunk at `offset` (payload ending at `end`) with only its frame data kept. */
const stripAnmf = (data: Buffer, offset: number, end: number): Buffer => {
  const bodyStart = offset + 8 + ANMF_HEADER;
  if (bodyStart > end) throw new MalformedImageError('WebP', 'ANMF chunk too short');
  const parts: Buffer[] = [Buffer.from(data.subarray(offset, bodyStart))];
  let hasBitstream = false;
  let sub = bodyStart;
  while (sub < end) {
    if (sub + 8 > end) throw new MalformedImageError('WebP', 'truncated chunk header in ANMF');
    const type = data.toString('latin1', sub, sub + 4);
    const size = data.readUInt32LE(sub + 4);
    const subEnd = sub + 8 + size + (size % 2);
    if (subEnd > end) throw new MalformedImageError('WebP', `chunk ${JSON.stringify(type)} runs past its ANMF frame`);
    if (ANMF_KEEP.has(type)) {
      parts.push(data.subarray(sub, subEnd));
      if (type !== 'ALPH') hasBitstream = true;
    }
    sub = subEnd;
  }
  if (!hasBitstream) throw new MalformedImageError('WebP', 'ANMF frame without image data');
  const chunk = Buffer.concat(parts);
  chunk.writeUInt32LE(chunk.length - 8, 4);
  return chunk;
};

export const stripWebp = (data: Buffer): Buffer => {
  if (data.length < 20 || data.toString('latin1', 0, 4) !== 'RIFF' || data.toString('latin1', 8, 12) !== 'WEBP') {
    throw new MalformedImageError('WebP', 'missing RIFF/WEBP header');
  }
  const riffEnd = 8 + data.readUInt32LE(4);
  if (riffEnd > data.length) throw new MalformedImageError('WebP', 'RIFF size runs past the end of the file');

  const chunks: Buffer[] = [];
  let vp8x: Buffer | undefined;
  let hasIcc = false;
  let offset = 12;

  // Bytes beyond the RIFF size are not part of the file and are dropped.
  while (offset < riffEnd) {
    if (offset + 8 > riffEnd) throw new MalformedImageError('WebP', 'truncated chunk header');
    const type = data.toString('latin1', offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (end > riffEnd) throw new MalformedImageError('WebP', `chunk ${JSON.stringify(type)} runs past the RIFF size`);
    if (offset === 12 && !WEBP_IMAGE.has(type)) {
      throw new MalformedImageError('WebP', `first chunk ${JSON.stringify(type)} is not VP8, VP8L or VP8X`);
    }
    if (type === 'ANMF') {
      chunks.push(stripAnmf(data, offset, offset + 8 + size));
    } else if (WEBP_KEEP.has(type)) {
      const chunk = Buffer.from(data.subarray(offset, end));
      if (type === 'VP8X') {
        if (size < 10) throw new MalformedImageError('WebP', 'VP8X chunk too short');
        vp8x = chunk;
      }
      if (type === 'ICCP') hasIcc = true;
      chunks.push(chunk);
    }
    offset = end;
  }
  if (!chunks.some((chunk) => chunk.toString('latin1', 0, 4) !== 'VP8X' && chunk.toString('latin1', 0, 4) !== 'ICCP')) {
    throw new MalformedImageError('WebP', 'no image data');
  }

  if (vp8x) {
    // The flags must describe the chunks actually present.
    let flags = vp8x[8] & ~(VP8X_EXIF | VP8X_XMP);
    flags = hasIcc ? flags | VP8X_ICC : flags & ~VP8X_ICC;
    vp8x[8] = flags;
  }

  const body = Buffer.concat(chunks);
  const header = Buffer.from('RIFF\0\0\0\0WEBP', 'latin1');
  header.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([header, body]);
};

// ============================================================================
// AVIF (detection only)
// ============================================================================

/**
 * True when an AVIF/HEIF file declares an `Exif` or `mime` (XMP) item in its
 * `meta` box. Throws when the box structure cannot be walked.
 */
export const heifHasMetadataItems = (data: Buffer): boolean => {
  const boxes = function* (start: number, end: number) {
    let offset = start;
    while (offset + 8 <= end) {
      let size = data.readUInt32BE(offset);
      const type = data.toString('latin1', offset + 4, offset + 8);
      let header = 8;
      if (size === 1) {
        if (offset + 16 > end) throw new MalformedImageError('AVIF', 'truncated box header');
        size = Number(data.readBigUInt64BE(offset + 8));
        header = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < header || offset + size > end) {
        throw new MalformedImageError('AVIF', `box ${JSON.stringify(type)} runs past its parent`);
      }
      yield { type, body: offset + header, end: offset + size };
      offset += size;
    }
  };

  for (const top of boxes(0, data.length)) {
    if (top.type !== 'meta') continue;
    // `meta` is a full box: 4 bytes of version and flags before its children.
    for (const child of boxes(top.body + 4, top.end)) {
      if (child.type !== 'iinf') continue;
      const version = data[child.body];
      const entriesStart = child.body + 4 + (version === 0 ? 2 : 4);
      for (const entry of boxes(entriesStart, child.end)) {
        if (entry.type !== 'infe') continue;
        const infeVersion = data[entry.body];
        if (infeVersion < 2) continue;
        const typeAt = entry.body + 4 + (infeVersion === 2 ? 2 : 4) + 2;
        if (typeAt + 4 > entry.end) throw new MalformedImageError('AVIF', 'truncated infe box');
        const itemType = data.toString('latin1', typeAt, typeAt + 4);
        if (itemType === 'Exif' || itemType === 'mime') return true;
      }
    }
  }
  return false;
};
