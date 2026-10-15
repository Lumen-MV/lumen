// Writes src/app/favicon.ico (16 / 32 / 48 px PNG entries packed in one ICO) with the same red tile + white "Lumen" block
// mark as the PWA icons. Run once: node scripts/generate-favicon.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "favicon.ico");
const RED = [229, 9, 20];
const WHITE = [255, 255, 255];

/** Glyph cells on a 12×12 grid: a bold "L" (cols 3-8), rows 2-10 — same as generate-pwa-icons.mjs. */
function lit(cx, cy) {
  const L = (cx >= 3 && cx <= 4) || (cy >= 9 && cx >= 3 && cx <= 8);
  return cy >= 2 && cy <= 10 && L;
}

function renderPng(size) {
  const png = new PNG({ width: size, height: size });
  const cell = size / 12;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const [r, g, b] = lit(Math.floor(x / cell), Math.floor(y / cell)) ? WHITE : RED;
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

/** ICO container: 6-byte header, 16-byte directory entry per image, then the PNG payloads. */
function packIco(sizes) {
  const images = sizes.map((s) => ({ size: s, data: renderPng(s) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size === 256 ? 0 : size, 0); e.writeUInt8(size === 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

fs.writeFileSync(OUT, packIco([16, 32, 48]));
console.log(`wrote ${OUT}`);
