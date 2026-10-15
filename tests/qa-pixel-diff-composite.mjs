// Builds qa/cmp-<name>.png = [real | mock | diff] cropped to the diff bounding box (+pad) for visual inspection.
//   node tests/qa-pixel-diff-composite.mjs <name> [<name> ...]   (name = e.g. login-invite-loading-m)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QA = path.join(ROOT, "qa");
const THRESHOLD = 40, PAD = 24;
const read = (p) => PNG.sync.read(fs.readFileSync(p));

for (const name of process.argv.slice(2)) {
  const a = read(path.join(QA, `real-${name}.png`)), b = read(path.join(QA, `mock-${name}.png`));
  let minY = a.height, maxY = -1, minX = a.width, maxX = -1;
  const diff = new PNG({ width: a.width, height: a.height });
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    const px = (i / 4) % a.width, py = Math.floor(i / 4 / a.width);
    if (d > THRESHOLD) { diff.data[i] = 255; diff.data[i + 1] = 0; diff.data[i + 2] = 0; diff.data[i + 3] = 255; if (py < minY) minY = py; if (py > maxY) maxY = py; if (px < minX) minX = px; if (px > maxX) maxX = px; }
    else { diff.data[i] = a.data[i] >> 1; diff.data[i + 1] = a.data[i + 1] >> 1; diff.data[i + 2] = a.data[i + 2] >> 1; diff.data[i + 3] = 255; }
  }
  if (maxY < 0) { console.log(`${name}: identical`); continue; }
  const x0 = Math.max(0, minX - PAD), y0 = Math.max(0, minY - PAD), x1 = Math.min(a.width, maxX + PAD), y1 = Math.min(a.height, maxY + PAD);
  const w = x1 - x0, h = y1 - y0, gap = 8;
  const out = new PNG({ width: w * 3 + gap * 2, height: h });
  out.data.fill(255);
  const blit = (src, ox) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const si = ((y + y0) * src.width + (x + x0)) * 4, di = (y * out.width + x + ox) * 4; out.data[di] = src.data[si]; out.data[di + 1] = src.data[si + 1]; out.data[di + 2] = src.data[si + 2]; out.data[di + 3] = 255; } };
  blit(a, 0); blit(b, w + gap); blit(diff, (w + gap) * 2);
  fs.writeFileSync(path.join(QA, `cmp-${name}.png`), PNG.sync.write(out));
  console.log(`${name}: crop x${x0}-${x1} y${y0}-${y1} → cmp-${name}.png (${out.width}x${out.height})`);
}
