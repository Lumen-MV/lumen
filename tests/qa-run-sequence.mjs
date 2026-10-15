// Runs QA scripts one after another and keeps going after a failure (an `&&` chain silently skips the rest), then
// exits 1 when any of them failed. Usage: node tests/qa-run-sequence.mjs tests/a.mjs tests/b.mjs [-- extra args]
import { spawnSync } from "node:child_process";

const sep = process.argv.indexOf("--");
const scripts = sep < 0 ? process.argv.slice(2) : process.argv.slice(2, sep);
const extra = sep < 0 ? [] : process.argv.slice(sep + 1);
if (!scripts.length) {
  console.error("usage: node tests/qa-run-sequence.mjs <script.mjs> [...] [-- args]");
  process.exit(2);
}
const results = [];
for (const script of scripts) {
  console.log(`\n=== ${script} ===`);
  const r = spawnSync(process.execPath, [script, ...extra], { stdio: "inherit", env: process.env });
  results.push({ script, code: r.status ?? 1 });
}
console.log("\n=== summary ===");
for (const r of results) console.log(`${r.code === 0 ? "ok  " : "FAIL"} ${r.script} (exit ${r.code})`);
process.exit(results.some((r) => r.code !== 0) ? 1 : 0);
