// Pixel diff of qa/real-*.png vs qa/mock-*.png (same name). Prints a table sorted by mismatch %
// and writes qa/diff-<name>.png (red = differing pixels on a dimmed real screenshot) for the worst N.
//   node tests/qa-pixel-diff.mjs [--top 8] [--threshold 40] [--pages index,browse,search,detail,series]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QA = path.join(ROOT, "qa");
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const TOP = Number(opt("top", 8));
const THRESHOLD = Number(opt("threshold", 40)); // max abs channel delta still counted as "same"
const PAGES = opt("pages", "") ? new RegExp(`^real-(${opt("pages", "").split(",").join("|")})-`) : null; // e.g. --pages index,browse,search,detail,series

const read = (p) => PNG.sync.read(fs.readFileSync(p));

const rows = [];
for (const f of fs.readdirSync(QA).filter((f) => f.startsWith("real-") && f.endsWith(".png") && !f.includes("FAILED") && (!PAGES || PAGES.test(f)))) {
  const mockPath = path.join(QA, f.replace(/^real-/, "mock-"));
  if (!fs.existsSync(mockPath)) { rows.push({ name: f, pct: NaN, note: "no mock" }); continue; }
  const a = read(path.join(QA, f)), b = read(mockPath);
  if (a.width !== b.width || a.height !== b.height) { rows.push({ name: f, pct: NaN, note: `size ${a.width}x${a.height} vs ${b.width}x${b.height}` }); continue; }
  const out = new PNG({ width: a.width, height: a.height });
  let diff = 0;
  let minY = a.height, maxY = -1, minX = a.width, maxX = -1;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    if (d > THRESHOLD) {
      diff++;
      out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 0; out.data[i + 3] = 255;
      const px = (i / 4) % a.width, py = Math.floor(i / 4 / a.width);
      if (py < minY) minY = py; if (py > maxY) maxY = py; if (px < minX) minX = px; if (px > maxX) maxX = px;
    } else {
      out.data[i] = a.data[i] >> 2; out.data[i + 1] = a.data[i + 1] >> 2; out.data[i + 2] = a.data[i + 2] >> 2; out.data[i + 3] = 255;
    }
  }
  const pct = (diff / (a.width * a.height)) * 100;
  rows.push({ name: f, pct, bbox: maxY >= 0 ? `x${minX}-${maxX} y${minY}-${maxY}` : "-", png: out });
}

rows.sort((x, y) => (isNaN(y.pct) ? -1 : isNaN(x.pct) ? 1 : y.pct - x.pct));
console.log("| pair | mismatch % | diff bbox |");
console.log("|---|---|---|");
for (const r of rows) console.log(`| ${r.name.replace(/^real-/, "").replace(/\.png$/, "")} | ${isNaN(r.pct) ? r.note : r.pct.toFixed(2)} | ${r.bbox ?? ""} |`);
for (const r of rows.filter((r) => r.png).slice(0, TOP)) {
  fs.writeFileSync(path.join(QA, r.name.replace(/^real-/, "diff-")), PNG.sync.write(r.png));
}
console.log(`\nwrote diff-*.png for the worst ${Math.min(TOP, rows.length)} pairs → ${QA}`);
