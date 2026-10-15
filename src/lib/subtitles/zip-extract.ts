import { inflateRawSync } from "node:zlib";

/**
 * Minimal ZIP reader (no dependency): walks the central directory and returns the entries (stored or deflated).
 * SubDL archives are a handful of small text files, so everything is read into memory — bounded: entries are
 * filtered by name BEFORE inflating, every inflate carries `maxOutputLength`, and the total inflated size is capped.
 * Encrypted / unsupported methods are skipped; a truncated archive or an oversized entry throws.
 */
export type ZipEntry = { name: string; bytes: Uint8Array };
export type UnzipOptions = { /** only entries whose name passes are read (default: all) */ filter?: (name: string) => boolean; /** per-entry and total inflated cap, bytes (default 16 MiB) */ maxOutputLength?: number };
export const ZIP_MAX_INFLATED = 16 * 1024 * 1024;
const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

export function unzip(data: Uint8Array, opts: UnzipOptions = {}): ZipEntry[] {
  const cap = opts.maxOutputLength ?? ZIP_MAX_INFLATED;
  const keep = opts.filter ?? (() => true);
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip: end of central directory not found");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  let inflated = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CENTRAL) throw new Error("zip: bad central directory");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (flags & 0x1 || name.endsWith("/") || !keep(name)) continue; // encrypted, directory or not wanted
    if (uncompSize > cap || inflated + uncompSize > cap) throw new Error(`zip: entry ${name} exceeds the inflate cap`);
    if (localOff + 30 > buf.length || buf.readUInt32LE(localOff) !== SIG_LOCAL) throw new Error("zip: bad local header");
    const start = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
    if (start + compSize > buf.length) throw new Error("zip: truncated entry");
    const raw = buf.subarray(start, start + compSize);
    let bytes: Uint8Array;
    if (method === 0) bytes = new Uint8Array(raw);
    else if (method === 8) bytes = new Uint8Array(inflateRawSync(raw, { maxOutputLength: cap - inflated }));
    else continue;
    inflated += bytes.byteLength;
    if (inflated > cap) throw new Error("zip: inflated size exceeds the cap");
    out.push({ name, bytes });
  }
  return out;
}
