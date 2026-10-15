// Helpers shared by the Phase 2+ QA scripts (tests/qa-*-phase2*.mjs): .env reader (secrets never printed), PASS/FAIL reporter.
import fs from "node:fs";
import path from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** First-wins merge of .env.local then .env; strips quotes; never logs values. */
export function readEnv(root) {
  const env = {};
  for (const f of [".env.local", ".env"]) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const raw of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const k = line.slice(0, line.indexOf("=")).trim();
      let v = line.slice(line.indexOf("=") + 1).trim();
      if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1);
      if (!(k in env)) env[k] = v;
    }
  }
  return env;
}

/** Admin credentials from env or exit(2) — the value is only ever sent to /api/auth/login. */
export function adminCreds(env) {
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
    console.error("missing ADMIN_USERNAME / ADMIN_PASSWORD in .env.local");
    process.exit(2);
  }
  return { u: env.ADMIN_USERNAME, p: env.ADMIN_PASSWORD };
}

/** Collects PASS/FAIL lines; `finish()` prints them and exits 1 on any failure. */
export function makeReporter() {
  const lines = [];
  let failures = 0;
  return {
    check(name, ok, detail = "") {
      lines.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
      if (!ok) failures++;
    },
    note: (s) => lines.push(`NOTE ${s}`),
    finish() {
      console.log(lines.join("\n"));
      console.log(`\n${lines.length - failures}/${lines.length} checks passed`);
      process.exit(failures ? 1 : 0);
    },
  };
}
