// Writes qa/gallery.html: every state of scripts/states-manifest.json as real | mock pairs at both viewports (desktop
// 1440×900 and mobile 390×844), grouped by page, with a per-pair "missing" marker when a screenshot is absent.
//   node scripts/build-qa-gallery.mjs   → open qa/gallery.html (images are referenced relatively, no server needed)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QA = path.join(ROOT, "qa");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "states-manifest.json"), "utf8"));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const img = (file, label) => (fs.existsSync(path.join(QA, file)) ? `<figure><img loading="lazy" src="${file}" alt="${esc(label)}"><figcaption>${esc(label)}</figcaption></figure>` : `<figure class="missing"><div>missing<br>${esc(file)}</div><figcaption>${esc(label)}</figcaption></figure>`);

const pages = [...new Set(manifest.states.map((s) => s.page))];
let present = 0, total = 0;
const sections = pages.map((page) => {
  const states = manifest.states.filter((s) => s.page === page);
  const rows = states.map((s) => {
    const name = `${s.page}-${s.state}`;
    const files = [`real-${name}.png`, `mock-${name}.png`, `real-${name}-m.png`, `mock-${name}-m.png`];
    total += 2;
    if (fs.existsSync(path.join(QA, files[0]))) present++;
    if (fs.existsSync(path.join(QA, files[2]))) present++;
    return `<section class="state" id="${esc(name)}"><h3>${esc(page)} · <code>${esc(s.state)}</code> <small>${esc(s.url)}${s.as ? ` · as ${esc(s.as)}` : ""}${s.scenario ? ` · ${esc(s.scenario.join(","))}` : ""}</small></h3>
<div class="pair desktop">${img(files[0], "real · 1440×900")}${img(files[1], "mock · 1440×900")}</div>
<div class="pair mobile">${img(files[2], "real · 390×844")}${img(files[3], "mock · 390×844")}</div></section>`;
  });
  return `<h2 id="page-${esc(page)}">${esc(page)} <small>${states.length} states</small></h2>${rows.join("\n")}`;
});

const nav = pages.map((p) => `<a href="#page-${esc(p)}">${esc(p)}</a>`).join(" · ");
const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Lumen — real vs mock gallery (${manifest.states.length} states)</title>
<style>
body{margin:0;background:#0b0c10;color:#ddd;font:14px/1.5 system-ui,sans-serif;padding:20px 28px}
h1{font-size:22px;margin:0 0 6px}h2{font-size:18px;margin:36px 0 10px;border-bottom:1px solid #333;padding-bottom:6px}h3{font-size:14px;margin:18px 0 6px}
h2 small,h3 small{color:#888;font-weight:400;font-size:12px;margin-left:8px}nav{color:#888;margin-bottom:10px}nav a{color:#7fb5ff;text-decoration:none}
.pair{display:flex;gap:12px;margin-bottom:10px}.pair.desktop figure{flex:1}.pair.mobile figure{flex:none}
figure{margin:0;background:#15161a;border:1px solid #2a2a2a;border-radius:6px;overflow:hidden}figure img{display:block;width:100%;height:auto}
.pair.mobile img{width:260px}figcaption{padding:4px 8px;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:.4px}
figure.missing div{display:grid;place-items:center;min-height:120px;color:#e50914;text-align:center;font-size:12px}.pair.desktop figure.missing{min-width:300px}
.stats{color:#9be69b}
</style></head><body>
<h1>Lumen — real vs mock</h1>
<nav>${nav}</nav>
<p class="stats">${manifest.states.length} states · ${present}/${total} real screenshots present · generated ${new Date().toISOString()}</p>
${sections.join("\n")}
</body></html>`;
fs.writeFileSync(path.join(QA, "gallery.html"), html);
console.log(`qa/gallery.html → ${manifest.states.length} states, ${present}/${total} real screenshots present`);
