/**
 * Subtitle bytes → string: UTF-8 / UTF-16 BOMs honoured, otherwise strict UTF-8, otherwise windows-1258 (legacy
 * Vietnamese files from community sites). Output is always a clean, NFC-normalised JS string without BOM —
 * windows-1258 encodes tone marks as combining bytes, which some fonts misplace unless precomposed.
 */
export function decodeSubtitle(input: Uint8Array | ArrayBuffer): string {
  let buf = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf.subarray(2)).normalize("NFC");
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf.subarray(2)).normalize("NFC");
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) buf = buf.subarray(3);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).normalize("NFC");
  } catch {
    return new TextDecoder("windows-1258").decode(buf).normalize("NFC");
  }
}
