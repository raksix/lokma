/**
 * Minimal stored (uncompressed) ZIP writer — no new dependency.
 * Shared by every exporter that ships a bundle (design artifacts, portable
 * state export, …). Python `zipfile`, `unzip` and browsers all read stored
 * entries. Moved here from `design/store.ts` (DRY — one implementation).
 */

/** One file inside the bundle (zip paths always use `/` separators). */
export type ZipEntry = { name: string; content: string };

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ (data[i] as number)) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Typed zip failure — readers map it straight to `{ code, message }`. */
export class ZipError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'ZipError';
    this.code = code;
    this.status = status;
  }
}

/** One entry parsed back out of a stored zip (method 0 only). */
export type ZipReadEntry = { name: string; data: Buffer };

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

function readU16(view: DataView, off: number): number {
  return view.getUint16(off, true);
}

function readU32(view: DataView, off: number): number {
  return view.getUint32(off, true);
}

/**
 * Parse a stored (uncompressed) zip back into entries — the inverse of
 * `buildStoredZip`. Only method 0 is accepted (anything deflated answers
 * `unsupported_entry`); CRC + lengths are verified, so a corrupt or
 * hand-edited bundle fails closed instead of writing garbage.
 */
export function readStoredZip(input: Buffer): ZipReadEntry[] {
  if (input.length < 22 || readU32(new DataView(input.buffer, input.byteOffset, 4), 0) !== LOCAL_SIG) {
    throw new ZipError('bad_zip', 'not a zip bundle (bad magic or too short)');
  }
  // EOCD sits at the very end when there is no archive comment (our writer
  // emits none) — still scan backwards to tolerate trailing bytes.
  const scanFrom = Math.max(0, input.length - 22 - 65557);
  let eocd = -1;
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  for (let off = input.length - 22; off >= scanFrom; off -= 1) {
    if (readU32(view, off) === EOCD_SIG) {
      eocd = off;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('bad_zip', 'zip end-of-central-directory not found');
  const centralCount = readU16(view, eocd + 10);
  const centralSize = readU32(view, eocd + 12);
  const centralOff = readU32(view, eocd + 16);
  if (centralOff + centralSize > input.length) {
    throw new ZipError('bad_zip', 'zip central directory runs past the end of the file');
  }
  const entries: ZipReadEntry[] = [];
  let ptr = centralOff;
  for (let i = 0; i < centralCount; i += 1) {
    if (ptr + 46 > input.length || readU32(view, ptr) !== CENTRAL_SIG) {
      throw new ZipError('bad_zip', `zip central entry ${i} is truncated`);
    }
    const method = readU16(view, ptr + 10);
    const crc = readU32(view, ptr + 16);
    const compSize = readU32(view, ptr + 20);
    const nameLen = readU16(view, ptr + 28);
    const extraLen = readU16(view, ptr + 30);
    const commentLen = readU16(view, ptr + 32);
    const localOff = readU32(view, ptr + 42);
    const name = input.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf-8');
    ptr += 46 + nameLen + extraLen + commentLen;
    if (method !== 0) {
      throw new ZipError('unsupported_entry', `zip entry ${name || `#${i}`} uses method ${method} (only stored entries are supported)`);
    }
    if (localOff + 30 > input.length || readU32(view, localOff) !== LOCAL_SIG) {
      throw new ZipError('zip_corrupt', `zip entry ${name || `#${i}`} has a bad local header`);
    }
    const localNameLen = readU16(view, localOff + 26);
    const localExtraLen = readU16(view, localOff + 28);
    const dataOff = localOff + 30 + localNameLen + localExtraLen;
    if (dataOff + compSize > input.length) {
      throw new ZipError('zip_corrupt', `zip entry ${name || `#${i}`} runs past the end of the file`);
    }
    const data = Buffer.from(input.subarray(dataOff, dataOff + compSize));
    if (crc32(data) !== crc) {
      throw new ZipError('zip_corrupt', `zip entry ${name || `#${i}`} failed its checksum`);
    }
    entries.push({ name, data });
  }
  return entries;
}

/** Build a stored ZIP bundle from in-memory text entries. */
export function buildStoredZip(files: ZipEntry[]): Buffer {
  const encoder = new TextEncoder();
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const crc = crc32(dataBytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dataBytes.length, 18);
    local.writeUInt32LE(dataBytes.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, Buffer.from(nameBytes), Buffer.from(dataBytes));
    const cent = Buffer.alloc(46);
    cent.writeUInt32LE(0x02014b50, 0);
    cent.writeUInt16LE(20, 4);
    cent.writeUInt16LE(20, 6);
    cent.writeUInt16LE(0, 8);
    cent.writeUInt16LE(0, 10);
    cent.writeUInt16LE(0, 12);
    cent.writeUInt16LE(0, 14);
    cent.writeUInt32LE(crc, 16);
    cent.writeUInt32LE(dataBytes.length, 20);
    cent.writeUInt32LE(dataBytes.length, 24);
    cent.writeUInt16LE(nameBytes.length, 28);
    cent.writeUInt16LE(0, 30);
    cent.writeUInt16LE(0, 32);
    cent.writeUInt16LE(0, 34);
    cent.writeUInt16LE(0, 36);
    cent.writeUInt32LE(0, 38);
    cent.writeUInt32LE(offset, 42);
    central.push(cent, Buffer.from(nameBytes));
    offset += 30 + nameBytes.length + dataBytes.length;
  }
  const centralBlob = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBlob.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBlob, end]);
}
