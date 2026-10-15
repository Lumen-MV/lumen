// Writes public/icons/icon-192.png + icon-512.png (red #e50914 tile with a white "Lumen" block mark) with pngjs — no image
// tooling needed on the VM or in CI. Run once: node scripts/generate-pwa-icons.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const RED = [229, 9, 20];
const WHITE = [255, 255, 255];

/** Glyph cells on a 12×12 grid: a bold "L" (cols 3-8), rows 2-10. */
function lit(cx, cy) {
  const L = (cx >= 3 && cx <= 4) || (cy >= 9 && cx >= 3 && cx <= 8);
  return cy >= 2 && cy <= 10 && L;
}

function render(size) {
  const png = new PNG({ width: size, height: size });
  const cell = size / 12;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const [r, g, b] = lit(Math.floor(x / cell), Math.floor(y / cell)) ? WHITE : RED;
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

fs.mkdirSync(OUT, { recursive: true });
for (const size of [192, 512]) fs.writeFileSync(path.join(OUT, `icon-${size}.png`), render(size));
console.log(`wrote icon-192.png + icon-512.png → ${OUT}`);
