// Phase 5 API contract checks against a RUNNING dev server (LUMEN_SCENARIOS=1): /api/subs/search (grouping, auto-select,
// quota, prefs), /api/subs/[id].vtt (conversion + cache + headers + 429 OS_QUOTA), /api/subs/s/… (signed path-style .srt/.vtt), /api/subs/translate (job API, 1 s
// polling, dedupe, JOB_RUNNING, DAILY_LIMIT, kie-down), /api/subs/prefs. REAL provider budget (skip with QA_SKIP_REAL=1):
// 1 OpenSubtitles search + 1 download, 2 SubDL searches + 1 download, 1 Kie job on the 6-cue fixture. No TorBox traffic.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adminCreds, makeReporter, readEnv, sleep } from "./qa-shared-helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const ENV = readEnv(ROOT);
const ADMIN = adminCreds(ENV);
const SKIP_REAL = process.env.QA_SKIP_REAL === "1";
const report = makeReporter();
const { check, note } = report;
const SPIDERMAN = "movie:634649";
const OPPENHEIMER = "movie:872585";
const SECRETS = [ENV.OPENSUBTITLES_API_KEY, ENV.SUBDL_API_KEY, ENV.KIE_API_KEY, ENV.TORBOX_API_KEY].filter(Boolean);
const noSecrets = (text) => !SECRETS.some((s) => text.includes(s)) && !/tb-cdn\.pw/.test(text);

function client() {
  const jar = new Map();
  async function raw(method, p, body, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (jar.size) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const i = pair.indexOf("=");
      if (/max-age=0/i.test(sc)) jar.delete(pair.slice(0, i).trim()); else jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    return res;
  }
  async function req(method, p, body, extraHeaders) {
    const res = await raw(method, p, body, extraHeaders);
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  return { get: (p, h) => req("GET", p, undefined, h), post: (p, b) => req("POST", p, b), patch: (p, b) => req("PATCH", p, b) };
}

async function pollJob(c, jobId, timeoutMs = 120_000) {
  const t0 = Date.now();
  let last = null;
  let polls = 0;
  while (Date.now() - t0 < timeoutMs) {
    last = (await c.get(`/api/subs/translate/${jobId}`)).json;
    polls++;
    if (last?.state !== "running") break;
    await sleep(1000);
  }
  return { last, polls, ms: Date.now() - t0 };
}

async function main() {
  const anon = client();
  for (const p of ["/api/subs/search?mediaKey=" + SPIDERMAN, "/api/subs/1.vtt", "/api/subs/translate/0123456789abcdef"]) check(`anon GET ${p.split("?")[0]} → 401`, (await anon.get(p)).status === 401);
  check("anon POST /api/subs/translate → 401", (await anon.post("/api/subs/translate", { sourceSubId: 1, mediaKey: SPIDERMAN })).status === 401);
  check("anon PATCH /api/subs/prefs → 401", (await anon.patch("/api/subs/prefs", { mediaKey: SPIDERMAN, offsetMs: 100 })).status === 401);

  const admin = client();
  check("admin login", (await admin.post("/api/auth/login", { username: ADMIN.u, password: ADMIN.p, remember: false })).status === 200);
  const health0 = (await admin.get("/api/health")).json;
  await admin.post("/api/dev/scenario", { flags: [] });
  await admin.post("/api/dev/seed", { fixture: "os-quota", remaining: null });

  // ---- validation
  check("search: bad mediaKey → 400, bad streamId → 400, unknown streamId → 410", (await admin.get("/api/subs/search?mediaKey=nope")).status === 400 && (await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}&streamId=zz`)).status === 400 && (await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}&streamId=${"0".repeat(32)}`)).status === 410);
  check("vtt: bad id → 400, unknown → 404", (await admin.get("/api/subs/abc.vtt")).status === 400 && (await admin.get("/api/subs/999999.vtt")).status === 404);
  check("translate: bad body → 400, unknown source → 404", (await admin.post("/api/subs/translate", { mediaKey: SPIDERMAN })).status === 400 && (await admin.post("/api/subs/translate", { mediaKey: SPIDERMAN, sourceSubId: 999999 })).status === 404);
  check("prefs: bad size → 400, offset out of range → 400", (await admin.patch("/api/subs/prefs", { mediaKey: SPIDERMAN, size: "XL" })).status === 400 && (await admin.patch("/api/subs/prefs", { mediaKey: SPIDERMAN, offsetMs: 99_999 })).status === 400);

  // ---- sim rows (no provider traffic): grouping, labels, auto-select, prefs, quota flag
  await admin.post("/api/dev/seed", { fixture: "subs", mediaKey: SPIDERMAN });
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover"] });
  const s1 = (await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}`)).json ?? {};
  const labels = (s1.tracks ?? []).map((t) => `${t.lang}:${t.source}:${t.label}`);
  check("sim popover: vi community (OS, 81k) → vi AI → en, auto-select vi, hasEnglish, quota 20, prefs defaults", labels.join("|") === "vi:os:Tiếng Việt (cộng đồng)|vi:ai:Tiếng Việt (Dịch AI)|en:os:English" && s1.selectedId === s1.tracks[0].id && s1.hasEnglish === true && s1.quota?.remaining === 20 && s1.prefs?.offsetMs === 0 && ["S", "M", "L"].includes(s1.prefs?.size) && s1.tracks[0].downloads === 81234 && s1.tracks[0].vttUrl === `/api/subs/${s1.tracks[0].id}.vtt`, labels.join("|"));
  const viId = s1.tracks?.[0]?.id, enId = s1.tracks?.[2]?.id;
  const v1 = await admin.get(`/api/subs/${viId}.vtt`);
  check("vtt: 200 text/vtt; charset=utf-8, Cache-Control private max-age=31536000, WEBVTT body with Vietnamese cue", v1.status === 200 && v1.headers.get("content-type") === "text/vtt; charset=utf-8" && v1.headers.get("cache-control") === "private, max-age=31536000" && /^WEBVTT\n\n1\n00:00:00\.000 --> 00:01:00\.000\n- Peter, mình cần nói chuyện/.test(v1.text), `${v1.status} ${v1.headers.get("content-type")}`);

  // ---- hand-off subtitle: /api/play/external carries the viewer's track as a signed, session-less, PATH-style .srt link
  // (/api/subs/s/{id}/{exp}/{sig}/subtitle.srt — extension last, no query string — the form Infuse / VLC sniff the format from)
  await admin.post("/api/dev/scenario", { flags: ["play-sample", "subs-sim=popover"] });
  await admin.post("/api/dev/seed", { fixture: "reset-rate-limit" });
  const hs = (await admin.post("/api/play/resolve", { mediaKey: SPIDERMAN, auto: true })).json ?? {};
  const ext = (await admin.get(`/api/play/external?streamId=${hs.streamId}&target=copy`)).json ?? {};
  const signedRe = new RegExp(`^${BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/api/subs/s/${viId}/(\\d+)/([0-9a-f]{64})/subtitle\\.srt$`);
  check("external copy → subtitle {label 'Tiếng Việt (cộng đồng)', signed absolute path-style .srt URL of the auto-selected vi row, no '?'}", ext.subtitle?.label === "Tiếng Việt (cộng đồng)" && signedRe.test(ext.subtitle?.url ?? "") && !(ext.subtitle?.url ?? "?").includes("?"), JSON.stringify(ext.subtitle));
  const IPHONE = { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" };
  const infuse = (await admin.get(`/api/play/external?streamId=${hs.streamId}&target=infuse`, IPHONE)).json ?? {};
  const vlcIos = (await admin.get(`/api/play/external?streamId=${hs.streamId}&target=vlc`, IPHONE)).json ?? {};
  const roundTrip = (link) => { try { const u = new URL(link); return u.searchParams.get("url") === ext.url && u.searchParams.get("sub") === ext.subtitle?.url && [...u.searchParams.keys()].join() === "url,sub"; } catch { return false; } };
  check("infuse / VLC iOS links: url + sub fully percent-encoded, a standard parser recovers both verbatim, encoded sub holds no ?/&/=", (infuse.url ?? "").startsWith("infuse://x-callback-url/play?url=") && (vlcIos.url ?? "").startsWith("vlc-x-callback://x-callback-url/stream?url=") && roundTrip(infuse.url) && roundTrip(vlcIos.url) && !/[?&=]/.test((infuse.url ?? "").split("&sub=")[1] ?? "?"), `${(infuse.url ?? "").slice(0, 60)}`);
  const signedPath = (ext.subtitle?.url ?? "").replace(BASE, "");
  const [, expQ, sigQ] = signedPath.match(/\/s\/\d+\/(\d+)\/([0-9a-f]+)\//) ?? [];
  const sv = await anon.get(signedPath);
  const srtBody = /^1\r\n00:00:00,000 --> 00:01:00,000\r\n- Peter, mình cần nói chuyện/.test(sv.text) && sv.text.endsWith("\r\n") && !sv.text.includes("WEBVTT");
  check("signed .srt without a cookie → 200 application/x-subrip; charset=utf-8, Content-Length = body bytes, Accept-Ranges bytes, Content-Disposition inline .srt, Cache-Control private max-age=3600, numbered CRLF SubRip body", sv.status === 200 && sv.headers.get("content-type") === "application/x-subrip; charset=utf-8" && sv.headers.get("content-length") === String(Buffer.byteLength(sv.text)) && sv.headers.get("accept-ranges") === "bytes" && /^inline; filename="\d+\.srt"$/.test(sv.headers.get("content-disposition") ?? "") && sv.headers.get("cache-control") === "private, max-age=3600" && srtBody, `${sv.status} ${sv.headers.get("content-type")} ${JSON.stringify(sv.text.slice(0, 60))}`);
  const svHead = await fetch(BASE + signedPath, { method: "HEAD" });
  check("HEAD on the signed .srt → 200, same Content-Type / Content-Length, empty body", svHead.status === 200 && svHead.headers.get("content-type") === "application/x-subrip; charset=utf-8" && svHead.headers.get("content-length") === sv.headers.get("content-length") && (await svHead.text()) === "");
  const svRange = await anon.get(signedPath, { range: "bytes=0-9" });
  check("Range bytes=0-9 → 206, Content-Range bytes 0-9/N, 10-byte body; bytes=99999999- → 416", svRange.status === 206 && svRange.headers.get("content-range") === `bytes 0-9/${sv.headers.get("content-length")}` && svRange.text.length === 10 && (await anon.get(signedPath, { range: "bytes=99999999-" })).status === 416);
  const vttPath = signedPath.replace(/subtitle\.srt$/, "subtitle.vtt");
  const vv = await anon.get(vttPath);
  check("the .vtt variant of the same signature → 200 text/vtt WEBVTT body; .ass / other file names → 404", vv.status === 200 && vv.headers.get("content-type") === "text/vtt; charset=utf-8" && vv.text.startsWith("WEBVTT") && (await anon.get(signedPath.replace(/subtitle\.srt$/, "subtitle.ass"))).status === 404 && (await anon.get(signedPath.replace(/subtitle\.srt$/, "x.srt"))).status === 404);
  check("tampered id → 404; bad sig → 404; exp changed → 404", (await anon.get(`/api/subs/s/${enId}/${expQ}/${sigQ}/subtitle.srt`)).status === 404 && (await anon.get(`/api/subs/s/${viId}/${expQ}/${"0".repeat(64)}/subtitle.srt`)).status === 404 && (await anon.get(`/api/subs/s/${viId}/${Number(expQ) + 1}/${sigQ}/subtitle.srt`)).status === 404);
  if (ENV.SESSION_SECRET) {
    const { createHmac } = await import("node:crypto");
    const past = Math.floor(Date.now() / 1000) - 5, far = Math.floor(Date.now() / 1000) + 2 * 3600;
    const sig = (id, exp) => createHmac("sha256", ENV.SESSION_SECRET).update(`${id}|${exp}`).digest("hex");
    check("expired (valid sig, exp in the past) → 404; forged 2 h exp → 404; a fresh self-signed link → 200", (await anon.get(`/api/subs/s/${viId}/${past}/${sig(viId, past)}/subtitle.srt`)).status === 404 && (await anon.get(`/api/subs/s/${viId}/${far}/${sig(viId, far)}/subtitle.srt`)).status === 404 && (await anon.get(`/api/subs/s/${viId}/${past + 65}/${sig(viId, past + 65)}/subtitle.srt`)).status === 200);
  } else note("SESSION_SECRET not in .env.local → expiry check skipped");
  check("unsigned anon .vtt still 401 (old ?exp=&sig= form too); signed JSON errors never leak subtitle text", (await anon.get(`/api/subs/${viId}.vtt`)).status === 401 && (await anon.get(`/api/subs/${viId}.vtt?exp=${expQ}&sig=${sigQ}`)).status === 401 && !/Peter|WEBVTT/.test((await anon.get(`/api/subs/s/${viId}/1/zz/subtitle.srt`)).text));
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover"] });
  check("prefs: PATCH offset/size/selected → 204, search echoes them; selectedSubId 0 → selectedId null; AI track id wins when chosen", (await admin.patch("/api/subs/prefs", { mediaKey: SPIDERMAN, offsetMs: 500, size: "L", selectedSubId: 0 })).status === 204 && (await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}`)).json?.selectedId === null && (await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}`)).json?.prefs?.offsetMs === 500 && (await admin.patch("/api/subs/prefs", { mediaKey: SPIDERMAN, selectedSubId: s1.tracks[1].id })).status === 204 && (await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}`)).json?.selectedId === s1.tracks[1].id);
  check("sub_lang=en setting → English auto-selected when nothing chosen", (await admin.patch("/api/subs/prefs", { mediaKey: SPIDERMAN, selectedSubId: null })).status === 204 && (await admin.patch("/api/me/settings", { sub_lang: "en" })).status === 200 && (await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}`)).json?.selectedId === enId);
  await admin.patch("/api/me/settings", { sub_lang: "vi" });
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover-none-en"] });
  const none = (await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}`)).json ?? {};
  check("sim popover-none-en: no tracks, hasEnglish false, selectedId null, autoTranslate off in the sim", none.tracks?.length === 0 && none.hasEnglish === false && none.selectedId === null && none.autoTranslate === false);
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover-none"] });
  check("sim popover-none: English listed but NOT auto-selected for a vi viewer (Tắt), hasEnglish", (await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}`)).json?.selectedId === null && (await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}`)).json?.hasEnglish === true);
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover-quota", "os-quota-zero"] });
  const q = (await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}`)).json ?? {};
  const qLabels = (q.tracks ?? []).map((t) => `${t.label}${t.locked ? "🔒" : ""}`);
  check("os-quota-zero: OS vi locked 🔒 with source-specific labels, SubDL active, quota 0 with reset ≈ 22 h, auto-select skips the locked one", qLabels.join("|") === "Tiếng Việt (OpenSubtitles)🔒|Tiếng Việt (SubDL)|English (SubDL)" && q.quota?.remaining === 0 && Math.round((q.quota.resetAt - Date.now()) / 3_600_000) === 22 && q.selectedId === q.tracks[1].id, qLabels.join("|"));
  check("vtt of the locked OS row → 429 OS_QUOTA; SubDL row still served", (await admin.get(`/api/subs/${q.tracks[0].id}.vtt`)).status === 429 && (await admin.get(`/api/subs/${q.tracks[0].id}.vtt`)).json?.code === "OS_QUOTA" && (await admin.get(`/api/subs/${q.tracks[1].id}.vtt`)).status === 200);

  // ---- translate job API with the fake backend (sim): 202 → 1 s polling → done → dedupe; JOB_RUNNING; DAILY_LIMIT; kie-down
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover-none"] });
  const t1 = await admin.post("/api/subs/translate", { mediaKey: SPIDERMAN, sourceSubId: enId });
  check("translate (sim): 202 {jobId}", t1.status === 202 && /^[0-9a-f]{16}$/.test(t1.json?.jobId ?? ""), `${t1.status}`);
  const r1 = await pollJob(admin, t1.json?.jobId, 30_000);
  check("poll → done with subId, new vi AI row listed + auto-selectable; same source again → 200 {subId}", r1.last?.state === "done" && typeof r1.last.subId === "number" && (await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}`)).json?.tracks.some((t) => t.id === r1.last.subId && t.source === "ai") && (await admin.post("/api/subs/translate", { mediaKey: SPIDERMAN, sourceSubId: enId })).json?.subId === r1.last.subId, JSON.stringify(r1.last));
  check("translating a vi row → 422 NOT_ENGLISH; foreign job id → 404", (await admin.post("/api/subs/translate", { mediaKey: SPIDERMAN, sourceSubId: viId })).status === 422 && (await admin.get("/api/subs/translate/0123456789abcdef")).status === 404);
  const notif = (await admin.get("/api/notifications")).json;
  check("subtitle_ready notification for the title", JSON.stringify(notif).includes("subtitle_ready") && JSON.stringify(notif).includes("Phụ đề AI"), JSON.stringify(notif).slice(0, 160));
  await admin.post("/api/dev/seed", { fixture: "subs", mediaKey: SPIDERMAN });
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover-translating"] });
  const s2 = (await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}`)).json;
  const t2 = await admin.post("/api/subs/translate", { mediaKey: SPIDERMAN, sourceSubId: s2.tracks[0].id });
  const t2b = await admin.post("/api/subs/translate", { mediaKey: SPIDERMAN, sourceSubId: s2.tracks[0].id });
  check("sim translating: job frozen at 42 %; second POST → 409 JOB_RUNNING {jobId}; search carries job", t2.status === 202 && (await admin.get(`/api/subs/translate/${t2.json.jobId}`)).json?.percent === 42 && t2b.status === 409 && t2b.json?.code === "JOB_RUNNING" && t2b.json?.jobId === t2.json.jobId && (await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}`)).json?.job?.jobId === t2.json.jobId, `${t2.status} ${t2b.status}`);
  await admin.post("/api/dev/seed", { fixture: "translate-jobs", mediaKey: SPIDERMAN, count: 5 });
  check("5 jobs today → 429 DAILY_LIMIT", (await admin.post("/api/subs/translate", { mediaKey: SPIDERMAN, sourceSubId: s2.tracks[0].id })).status === 429);
  await admin.post("/api/dev/seed", { fixture: "subs", mediaKey: SPIDERMAN });
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover-translate-failed", "kie-down"] });
  const s3 = (await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}`)).json;
  const t3 = await admin.post("/api/subs/translate", { mediaKey: SPIDERMAN, sourceSubId: s3.tracks[0].id });
  const r3 = await pollJob(admin, t3.json?.jobId, 30_000);
  check("kie-down → job error with errorMsg; search reports the failed job (Thử lại row)", t3.status === 202 && r3.last?.state === "error" && /kie-down/.test(r3.last.errorMsg ?? "") && (await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}`)).json?.job?.state === "error", JSON.stringify(r3.last));
  // Thử lại = the SAME job resumed (same id), not a new one; failed jobs never count toward 5/day
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover-translate-failed"] });
  const t3b = await admin.post("/api/subs/translate", { mediaKey: SPIDERMAN, sourceSubId: s3.tracks[0].id });
  const r3b = await pollJob(admin, t3b.json?.jobId, 30_000);
  check("Thử lại without kie-down: 202 with the SAME jobId, job resumes and finishes (done, subId)", t3b.status === 202 && t3b.json?.jobId === t3.json?.jobId && r3b.last?.state === "done" && typeof r3b.last?.subId === "number", `${t3b.status} ${t3b.json?.jobId} vs ${t3.json?.jobId} → ${JSON.stringify(r3b.last)}`);
  await admin.post("/api/dev/seed", { fixture: "subs", mediaKey: SPIDERMAN });
  await admin.post("/api/dev/scenario", { flags: [] });

  // ---- REAL providers (budget: OS 1 search + 1 download, SubDL 2 searches + 1 download, Kie 1 short job)
  if (SKIP_REAL) note("QA_SKIP_REAL=1: real OpenSubtitles / SubDL / Kie section skipped");
  else {
    await admin.post("/api/dev/seed", { fixture: "clear-subs", mediaKey: SPIDERMAN });
    const t0 = Date.now();
    const real = await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}`);
    const rt = real.json?.tracks ?? [];
    const vi = rt.find((t) => t.lang === "vi" && !t.ai), en = rt.find((t) => t.lang === "en"), subdlVi = rt.find((t) => t.lang === "vi" && t.source === "subdl");
    check("REAL search tt10872600: vi community + en tracks, ≤ 6.5 s, no secrets in JSON", real.status === 200 && Boolean(vi) && Boolean(en) && real.json.hasEnglish && Date.now() - t0 < 6500 && noSecrets(real.text), rt.map((t) => `${t.lang}:${t.source}:${t.downloads ?? 0}`).join(" "));
    const rv = await admin.get(`/api/subs/${vi?.id}.vtt`);
    const cueCount = (rv.text.match(/-->/g) ?? []).length;
    // the account's counter comes from the API (the spike already spent some of today's 20): after an OS download it is < 20
    const after = (await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}`)).json?.quota?.remaining;
    check("REAL vi download → valid VTT with ≥ 500 cues and diacritics; OS quota counter recorded from the API (< 20)", rv.status === 200 && /^WEBVTT\n/.test(rv.text) && cueCount >= 500 && /[ăâđêôơưàảãáạ]/i.test(rv.text) && (vi.source !== "os" || (typeof after === "number" && after < 20)), `${rv.status} ${vi?.source} cues=${cueCount} quota after=${after}`);
    const again = await admin.get(`/api/subs/${vi?.id}.vtt`);
    check("second GET served from cache (quota unchanged, same body)", again.status === 200 && again.text === rv.text && (await admin.get(`/api/subs/search?mediaKey=${SPIDERMAN}`)).json.quota.remaining === after);
    if (subdlVi && subdlVi.id !== vi.id) {
      const rs = await admin.get(`/api/subs/${subdlVi.id}.vtt`);
      check("REAL SubDL zip → .srt/.ass → VTT", rs.status === 200 && /^WEBVTT\n/.test(rs.text) && (rs.text.match(/-->/g) ?? []).length >= 200, `${rs.status}`);
    } else note("no distinct SubDL vi track in the real result (download skipped)");
    // real Kie on the 6-cue fixture of another title (never the full movie)
    await admin.post("/api/dev/seed", { fixture: "subs", mediaKey: OPPENHEIMER });
    await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover-none"] });
    const fx = (await admin.get(`/api/subs/search?mediaKey=${OPPENHEIMER}`)).json;
    await admin.post("/api/dev/scenario", { flags: [] });
    const kt0 = Date.now();
    const kj = await admin.post("/api/subs/translate", { mediaKey: OPPENHEIMER, sourceSubId: fx.tracks[0].id });
    const kr = await pollJob(admin, kj.json?.jobId, 120_000);
    const kv = kr.last?.subId ? await admin.get(`/api/subs/${kr.last.subId}.vtt`) : { status: 0, text: "" };
    check("REAL Kie DeepSeek: 6 cues → done, Vietnamese VTT with diacritics, < 90 s", kj.status === 202 && kr.last?.state === "done" && kv.status === 200 && /[ăâđêôơưàảãáạếề]/i.test(kv.text) && (kv.text.match(/-->/g) ?? []).length === 6 && Date.now() - kt0 < 90_000, `${kr.ms} ms, ${kr.polls} polls: ${kv.text.split("\n").slice(4, 6).join(" / ")}`);
    note(`real Kie cost accounted: ${JSON.stringify((await admin.get("/api/health")).json?.ai ?? "n/a")}`);
    await admin.post("/api/dev/seed", { fixture: "clear-subs", mediaKey: OPPENHEIMER });
  }
  const health1 = (await admin.get("/api/health")).json;
  const torboxDelta = (health1?.torbox?.calls ?? 0) - (health0?.torbox?.calls ?? 0);
  // the background title_sources sweeper also counts: the strict assertion only holds when the server runs with LUMEN_SWEEPER=0
  if (health1?.sweeper === false) check("TorBox API untouched by this script (counter delta 0, sweeper off)", torboxDelta === 0, `${health0?.torbox?.calls} → ${health1?.torbox?.calls}`);
  else note(`TorBox counter delta during this script: ${torboxDelta} — sweeper enabled, start the dev server with LUMEN_SWEEPER=0 for the strict "untouched" check`);
  await admin.post("/api/dev/scenario", { flags: [] });
  report.finish();
}

main().catch((err) => { console.error(err); process.exit(1); });
