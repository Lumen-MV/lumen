/**
 * Provider downloads are small text files; a hostile / broken server must not be able to fill memory. The declared
 * `content-length` is checked first, then the body is streamed and aborted as soon as it exceeds the cap.
 */
export class BodyTooLargeError extends Error {
  constructor(readonly cap: number) {
    super(`response body exceeds ${cap} bytes`);
    this.name = "BodyTooLargeError";
  }
}

export const OS_MAX_BYTES = 4 * 1024 * 1024;
export const SUBDL_MAX_BYTES = 8 * 1024 * 1024;

export async function readBodyCapped(res: Response, cap: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) throw new BodyTooLargeError(cap);
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > cap) throw new BodyTooLargeError(cap);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError(cap);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}
