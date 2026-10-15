// Phase 5 extra API checks (from the tester's p5-api-extra, made durable) against a RUNNING dev server (LUMEN_SCENARIOS=1):
// .vtt hardening, the auto-select matrix, stored OS-quota bookkeeping, cross-session prefs, a 600-cue (12-batch) job,
// kie-down → "Thử lại" RESUMES the same job (finished batches kept, no daily slot burnt), failed jobs never count toward
// 5/day, a second user attaches to a running job (one paid run, both notified). Zero real provider traffic: every job
// runs under `subs-sim` / `kie-down` (fake translator); the big English row comes from the `subs-row` fixture.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adminCreds, makeReporter, readEnv, sleep } from "./qa-shared-helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const ADMIN = adminCreds(readEnv(ROOT));
const report = makeReporter();
const { check, note } = report;
const MOVIE = "movie:634649";
const OTHER = "movie:872585";
const USER2 = { username: "qap5user", displayName: "QA P5", password: "QaP5Pass123!" };

function client() {
  const jar = new Map();
  async function req(method, p, body, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (jar.size) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const i = pair.indexOf("=");
      if (/max-age=0/i.test(sc)) jar.delete(pair.slice(0, i).trim()); else jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  return { get: (p, h) => req("GET", p, undefined, h), post: (p, b) => req("POST", p, b), patch: (p, b) => req("PATCH", p, b) };
}
const search = async (c, key = MOVIE) => (await c.get(`/api/subs/search?mediaKey=${key}`)).json ?? {};
async function poll(c, jobId, timeoutMs = 60_000) {
  const t0 = Date.now();
  const samples = [];
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = (await c.get(`/api/subs/translate/${jobId}`)).json;
    samples.push(last?.percent);
    if (last?.state !== "running") break;
    await sleep(1000);
  }
  return { last, samples, ms: Date.now() - t0 };
}
// `subdl` so the row gets its own (lang, source) slot next to the sim's en-os row (one track per slot)
const bigRow = async (c) => (await c.post("/api/dev/seed", { fixture: "subs-row", mediaKey: MOVIE, lang: "en", source: "subdl", label: "Big.English.600.cues", cues: 600 })).json?.id;

async function main() {
  const admin = client();
  check("admin login", (await admin.post("/api/auth/login", { username: ADMIN.u, password: ADMIN.p, remember: false })).status === 200);
  const health0 = (await admin.get("/api/health")).json;
  await admin.post("/api/dev/scenario", { flags: [] });
  await admin.post("/api/dev/seed", { fixture: "os-quota", remaining: null });
  await admin.patch("/api/me/settings", { sub_lang: "vi", sub_size: "M" });
  await admin.post("/api/dev/seed", { fixture: "subs", mediaKey: MOVIE });
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover"] });
  const s0 = await search(admin);
  const viId = s0.tracks?.find((t) => t.lang === "vi" && !t.ai)?.id, aiId = s0.tracks?.find((t) => t.ai)?.id, enId = s0.tracks?.find((t) => t.lang === "en")?.id;

  // ---------------------------------------------------------------- .vtt route hardening
  const v = await admin.get(`/api/subs/${viId}.vtt`);
  check("vtt: LF-only body, WEBVTT header, trailing newline, no BOM", v.text.startsWith("WEBVTT\n\n") && !v.text.includes("\r") && v.text.endsWith("\n"));
  const anon = client();
  const a1 = await anon.get(`/api/subs/${viId}.vtt`);
  check("vtt: anon → 401 JSON (no VTT leak); 0.vtt → 404; 10-digit id → 400; traversal → 400/404", a1.status === 401 && !a1.text.startsWith("WEBVTT") && (await admin.get("/api/subs/0.vtt")).status === 404 && (await admin.get("/api/subs/1234567890.vtt")).status === 400 && [400, 404].includes((await admin.get("/api/subs/..%2F..%2Fpackage.json.vtt")).status), `${a1.status}`);
  await admin.post("/api/dev/seed", { fixture: "subs", mediaKey: OTHER });
  const rowOther = (await admin.post("/api/dev/seed", { fixture: "subs-row", mediaKey: OTHER, lang: "en", source: "os", cues: 2 })).json;
  const vOther = await admin.get(`/api/subs/${rowOther?.id}.vtt`);
  check("subs-row fixture → ready row served as VTT (2 cues, text/vtt)", rowOther?.cues === 2 && vOther.status === 200 && (vOther.text.match(/-->/g) ?? []).length === 2 && vOther.headers.get("content-type") === "text/vtt; charset=utf-8");

  // ---------------------------------------------------------------- auto-select matrix (last used → sub_lang → …)
  const sel = async () => (await search(admin)).selectedId;
  await admin.patch("/api/subs/prefs", { mediaKey: MOVIE, selectedSubId: null });
  check("auto: sub_lang=vi, nothing chosen → vi human", (await sel()) === viId);
  await admin.patch("/api/subs/prefs", { mediaKey: MOVIE, selectedSubId: enId });
  check("auto: last used (English) wins over sub_lang=vi", (await sel()) === enId);
  await admin.patch("/api/subs/prefs", { mediaKey: MOVIE, selectedSubId: 987654 });
  check("auto: stale last-used id → falls back to vi human", (await sel()) === viId);
  await admin.patch("/api/subs/prefs", { mediaKey: MOVIE, selectedSubId: null });
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover-ai"] });
  check("auto: vi HUMAN preferred over AI vi", (await sel()) === viId);
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover-none"] });
  check("auto: vi viewer, only English → Tắt (null) but hasEnglish", (await search(admin)).selectedId === null && (await search(admin)).hasEnglish === true);
  await admin.patch("/api/me/settings", { sub_lang: "en" });
  check("auto: sub_lang=en, only English → en", (await sel()) === enId);
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover-quota", "os-quota-zero"] });
  const q = await search(admin);
  check("auto: sub_lang=en + quota → SubDL en (locked OS skipped)", q.selectedId === q.tracks.find((t) => t.lang === "en")?.id);
  await admin.patch("/api/me/settings", { sub_lang: "off" });
  check("auto: sub_lang=off → null even with vi available", (await sel()) === null);
  await admin.patch("/api/me/settings", { sub_lang: "vi" });
  await admin.patch("/api/subs/prefs", { mediaKey: MOVIE, selectedSubId: q.tracks[0].id });
  check("auto: last-used = the LOCKED OS row → next usable (SubDL vi)", (await sel()) === q.tracks[1].id);
  await admin.patch("/api/subs/prefs", { mediaKey: MOVIE, selectedSubId: null });
  check("auto: sub_lang=vi + quota → SubDL vi auto-selected, autoTranslate false in the sim", (await sel()) === q.tracks[1].id && (await search(admin)).autoTranslate === false);

  // ---------------------------------------------------------------- stored OS-quota bookkeeping
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover-quota"] });
  await admin.post("/api/dev/seed", { fixture: "os-quota", remaining: 0, resetInHours: 5 });
  const q5 = await search(admin);
  check("stored remaining=0 reset in 5 h → quota {0, +5 h}, OS row locked + specific label, .vtt → 429 OS_QUOTA", q5.quota?.remaining === 0 && Math.round((q5.quota.resetAt - Date.now()) / 3_600_000) === 5 && q5.tracks[0]?.locked === true && q5.tracks[0]?.label === "Tiếng Việt (OpenSubtitles)" && (await admin.get(`/api/subs/${q5.tracks[0].id}.vtt`)).status === 429, JSON.stringify(q5.quota));
  await admin.post("/api/dev/seed", { fixture: "os-quota", remaining: 0, resetInHours: 0 });
  const qReset = await search(admin);
  check("reset time passed → quota back to 20, nothing locked", qReset.quota?.remaining === 20 && !qReset.tracks.some((t) => t.locked));
  await admin.post("/api/dev/seed", { fixture: "os-quota", remaining: 3, resetInHours: 10 });
  const q3 = await search(admin);
  check("remaining=3 → usable, several vi sources → specific labels", q3.quota?.remaining === 3 && !q3.tracks.some((t) => t.locked) && q3.tracks[0].label === "Tiếng Việt (OpenSubtitles)");
  await admin.post("/api/dev/seed", { fixture: "os-quota", remaining: null });
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover"] });
  check("single vi source + quota ok → generic label", (await search(admin)).tracks[0]?.label === "Tiếng Việt (cộng đồng)");

  // ---------------------------------------------------------------- prefs across sessions + validation
  const admin2 = client();
  await admin2.post("/api/auth/login", { username: ADMIN.u, password: ADMIN.p, remember: false });
  await admin2.post("/api/dev/scenario", { flags: ["subs-sim=popover"] });
  await admin.patch("/api/subs/prefs", { mediaKey: MOVIE, offsetMs: -1200, size: "S", selectedSubId: aiId });
  const d2 = await search(admin2);
  check("prefs from session A visible in session B (offset −1.2 s, S, AI selected)", d2.prefs?.offsetMs === -1200 && d2.prefs?.size === "S" && d2.selectedId === aiId);
  check("prefs: float offset / negative id → 400; per title; sub_size default for untouched titles", (await admin.patch("/api/subs/prefs", { mediaKey: MOVIE, offsetMs: 100.5 })).status === 400 && (await admin.patch("/api/subs/prefs", { mediaKey: MOVIE, selectedSubId: -1 })).status === 400 && (await search(admin2, OTHER)).prefs?.offsetMs === 0 && (await admin.patch("/api/me/settings", { sub_size: "L" })).status === 200 && (await search(admin2, OTHER)).prefs?.size === "L");
  await admin.patch("/api/me/settings", { sub_size: "M" });
  await admin.post("/api/dev/seed", { fixture: "subs", mediaKey: OTHER });
  await admin.post("/api/dev/seed", { fixture: "subs", mediaKey: MOVIE });

  // ---------------------------------------------------------------- 600-cue job (12 batches): monotonic percent, AI VTT, notification
  const bigId = await bigRow(admin);
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover-none"] });
  check("big English row listed by the sim (non-sim rows pass the filter)", (await search(admin)).tracks.some((t) => t.id === bigId));
  const j1 = await admin.post("/api/subs/translate", { mediaKey: MOVIE, sourceSubId: bigId });
  const p1 = await poll(admin, j1.json?.jobId);
  check("12-batch job: 202, percent monotonic with intermediate values, done < 15 s", j1.status === 202 && p1.last?.state === "done" && p1.samples.every((p, i) => i === 0 || p >= p1.samples[i - 1]) && p1.samples.some((p) => p > 0 && p < 100) && p1.ms < 15_000, `${p1.samples.join(">")} (${p1.ms} ms)`);
  const aiVtt = await admin.get(`/api/subs/${p1.last?.subId}.vtt`);
  check("AI VTT: 600 cues in order, source timings kept", (aiVtt.text.match(/-->/g) ?? []).length === 600 && /\n\[VI\] English line 0\n/.test(aiVtt.text) && /00:19:58\.000 --> 00:19:59\.500\n\[VI\] English line 599\n/.test(aiVtt.text));
  check("dedupe: same source again → 200 {subId}", (await admin.post("/api/subs/translate", { mediaKey: MOVIE, sourceSubId: bigId })).json?.subId === p1.last?.subId);

  // ---------------------------------------------------------------- kie-down → persisted job; Thử lại RESUMES it; failed jobs never count
  await admin.post("/api/dev/seed", { fixture: "subs", mediaKey: MOVIE });
  const bigId2 = await bigRow(admin);
  await admin.post("/api/dev/scenario", { flags: ["kie-down"] }); // no subs-sim → persisted like a real job, fake translator
  const j2 = await admin.post("/api/subs/translate", { mediaKey: MOVIE, sourceSubId: bigId2 });
  const p2 = await poll(admin, j2.json?.jobId);
  check("kie-down: fails once past 40 % (12 batches → 33 %), errorMsg mentions kie-down, no absolute path", p2.last?.state === "error" && p2.last?.percent === 33 && /kie-down/.test(p2.last?.errorMsg ?? "") && !/[A-Za-z]:\\|\/data\//.test(p2.last?.errorMsg ?? ""), JSON.stringify(p2.last));
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover-none"] }); // provider "back": fake translator, no real Kie
  const j3 = await admin.post("/api/subs/translate", { mediaKey: MOVIE, sourceSubId: bigId2 });
  const p3 = await poll(admin, j3.json?.jobId);
  check("Thử lại: 202 with the SAME jobId, resumes from 33 % (never restarts at 0) and finishes", j3.status === 202 && j3.json?.jobId === j2.json?.jobId && p3.last?.state === "done" && p3.samples[0] >= 33, `${j3.json?.jobId} vs ${j2.json?.jobId} · ${p3.samples.join(">")}`);
  // daily limit: 4 finished (seeded) + this failed one → the retry is NOT the 5th slot; after it finishes, the next NEW job is refused
  await admin.post("/api/dev/seed", { fixture: "subs", mediaKey: MOVIE });
  await admin.post("/api/dev/seed", { fixture: "translate-jobs", mediaKey: MOVIE, count: 4 });
  const bigId3 = await bigRow(admin);
  await admin.post("/api/dev/scenario", { flags: ["kie-down"] });
  const j4 = await admin.post("/api/subs/translate", { mediaKey: MOVIE, sourceSubId: bigId3 });
  await poll(admin, j4.json?.jobId);
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover-none"] });
  const j5 = await admin.post("/api/subs/translate", { mediaKey: MOVIE, sourceSubId: bigId3 });
  const p5 = await poll(admin, j5.json?.jobId);
  check("4 finished + 1 FAILED → Thử lại allowed (202, same id, done) — failures never burn the allowance", j5.status === 202 && j5.json?.jobId === j4.json?.jobId && p5.last?.state === "done", `${j5.status} ${JSON.stringify(p5.last)}`);
  const other = (await admin.post("/api/dev/seed", { fixture: "subs-row", mediaKey: MOVIE, lang: "en", source: "embedded", cues: 3 })).json?.id;
  check("now 5 finished today → a NEW source → 429 DAILY_LIMIT", (await admin.post("/api/subs/translate", { mediaKey: MOVIE, sourceSubId: other })).status === 429);
  await admin.post("/api/dev/seed", { fixture: "subs", mediaKey: MOVIE });

  // ---------------------------------------------------------------- second user attaches to a running job
  await admin.post("/api/dev/seed", { fixture: "user", ...USER2, onboarded: true });
  const user2 = client();
  check("second user logs in", (await user2.post("/api/auth/login", { username: USER2.username, password: USER2.password, remember: false })).status === 200);
  await user2.post("/api/dev/scenario", { flags: ["subs-sim=popover-none"] });
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover-none"] });
  const bigId4 = await bigRow(admin);
  const a = await admin.post("/api/subs/translate", { mediaKey: MOVIE, sourceSubId: bigId4 });
  await sleep(300);
  const b = await user2.post("/api/subs/translate", { mediaKey: MOVIE, sourceSubId: bigId4 });
  check("user B asks for the same source while A's job runs → 409 JOB_RUNNING with A's jobId (one paid run)", b.status === 409 && b.json?.code === "JOB_RUNNING" && b.json?.jobId === a.json?.jobId, `A ${a.status} ${a.json?.jobId} · B ${b.status} ${b.json?.jobId ?? b.json?.code}`);
  const sb = await search(user2);
  check("B's search carries the shared running job; B may poll it (200)", sb.job?.jobId === a.json?.jobId && (await user2.get(`/api/subs/translate/${a.json?.jobId}`)).status === 200);
  const ra = await poll(admin, a.json?.jobId);
  const rb = await poll(user2, a.json?.jobId);
  check("both see done with the same subId; B's track list has the AI row", ra.last?.state === "done" && rb.last?.subId === ra.last?.subId && (await search(user2)).tracks.some((t) => t.id === ra.last?.subId && t.source === "ai"));
  const nb = JSON.stringify((await user2.get("/api/notifications")).json ?? "");
  check("user B got a subtitle_ready notification too", nb.includes("subtitle_ready"), nb.slice(0, 120));
  check("anon cannot read the shared job (401)", (await client().get(`/api/subs/translate/${a.json?.jobId}`)).status === 401);
  await admin.post("/api/dev/seed", { fixture: "subs", mediaKey: MOVIE });
  await admin.post("/api/dev/seed", { fixture: "delete-user", username: USER2.username });
  await admin.post("/api/dev/scenario", { flags: [] });

  const health1 = (await admin.get("/api/health")).json;
  const delta = (health1?.torbox?.calls ?? 0) - (health0?.torbox?.calls ?? 0);
  if (health1?.sweeper === false) check("TorBox API untouched by this script (sweeper off)", delta === 0, `${health0?.torbox?.calls} → ${health1?.torbox?.calls}`);
  else note(`TorBox counter delta ${delta} (sweeper enabled — use LUMEN_SWEEPER=0 for the strict check)`);
  report.finish();
}

main().catch((err) => { console.error(err); process.exit(1); });
