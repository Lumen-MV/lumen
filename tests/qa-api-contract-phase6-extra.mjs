// Phase 6 extra API checks (moved from the tester's p6-api-extra), against a RUNNING dev server (LUMEN_SCENARIOS=1,
// LUMEN_SWEEPER=0). Beyond tests/qa-api-contract-phase6.mjs: settings validation + defaults, prefs honoured by /api/sources,
// the Stremio stream list and /api/subs/search, temp-password flow, lock → sessions + jobs die, Stremio 404 → unlock
// restores, 2-device sessions + logout others, delete cascade verified in SQLite, invite validation, member scoping,
// live cloud-sim queue, CSV secret scan + formula escape, KPIs vs DB, Stremio extras, health / robots / webmanifest.
// TorBox budget: ≤ 2 calls (one real /api/sources on Spider-Man, memoised 10 min) — 0 with QA_SKIP_REAL=1.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adminCreds, makeReporter, readEnv, sleep } from "./qa-shared-helpers.mjs";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const SKIP_REAL = process.env.QA_SKIP_REAL === "1";
const ENV = readEnv(ROOT);
const ADMIN = adminCreds(ENV);
const report = makeReporter();
const { check, note } = report;
const SECRETS = [ENV.TORBOX_API_KEY, ENV.TMDB_READ_TOKEN, ENV.KIE_API_KEY, ENV.OPENSUBTITLES_API_KEY, ENV.SUBDL_API_KEY, ENV.SESSION_SECRET].filter(Boolean);
const noSecrets = (text) => !SECRETS.some((s) => text.includes(s)) && !/tb-cdn\.pw|api_key=|token_hash/i.test(text);
const SPIDER = "movie:634649";
const db = new Database(path.join(ROOT, ENV.DATA_DIR || "./data", "lumen.sqlite"), { readonly: true, fileMustExist: true });
const q1 = (sql, ...p) => db.prepare(sql).get(...p);
const cnt = (table, col, id) => q1(`select count(*) as n from ${table} where ${col} = ?`, id).n;

function client(ua = "QA/1.0") {
  const jar = new Map();
  async function req(method, p, body, extra = {}) {
    const headers = { "user-agent": ua, ...extra };
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
    try { json = text ? JSON.parse(text) : null; } catch { /* html */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  return { get: (p, h) => req("GET", p, undefined, h), post: (p, b) => req("POST", p, b), patch: (p, b) => req("PATCH", p, b), del: (p, b) => req("DELETE", p, b) };
}
const login = async (c, u, p) => (await c.post("/api/auth/login", { username: u, password: p, remember: false })).status;
const calls = async (c) => (await c.get("/api/health")).json?.torbox?.calls ?? -1;

async function main() {
  const admin = client("Mozilla/5.0 (Windows NT 10.0) Chrome/130");
  check("admin login", (await login(admin, ADMIN.u, ADMIN.p)) === 200);
  await admin.post("/api/dev/scenario", { flags: [] });
  await admin.post("/api/dev/seed", { fixture: "reset-rate-limit" });
  await admin.post("/api/dev/seed", { fixture: "admin-data" });
  const calls0 = await calls(admin);
  const me = (await admin.get("/api/me")).json.user;

  // ---------- S1 settings validation + defaults
  check("profile: 41-char name → 400, 40-char ok", (await admin.patch("/api/me/profile", { displayName: "x".repeat(41) })).status === 400 && (await admin.patch("/api/me/profile", { displayName: "y".repeat(40) })).status === 200);
  const html = await admin.patch("/api/me/profile", { displayName: '<b>QA</b> & "x"' });
  const page = await admin.get("/settings?tab=profile");
  check("profile: HTML-ish name stored verbatim and escaped on the page (no raw <b>QA</b>)", html.json?.user?.displayName === '<b>QA</b> & "x"' && page.status === 200 && /&lt;b&gt;QA&lt;\/b&gt;/.test(page.text) && !/<b>QA<\/b>/.test(page.text));
  await admin.patch("/api/me/profile", { displayName: me.displayName });
  const palette = ["#2d6cdf", "#e50914", "#46d369", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6", "#64748b"];
  let okColors = 0;
  for (const c of palette) if ((await admin.patch("/api/me/profile", { avatarColor: c })).status === 200) okColors++;
  check("profile: all 8 mock swatches accepted", okColors === 8, String(okColors));
  await admin.patch("/api/me/profile", { avatarColor: me.avatarColor });
  await admin.post("/api/dev/seed", { fixture: "user", username: "qa_p6x", displayName: "QA X", password: "QaXPass123", onboarded: true });
  const mx = client();
  await login(mx, "qa_p6x", "QaXPass123");
  const defs = (await mx.get("/api/me")).json?.settings;
  check("new member defaults (/api/me.settings): auto_translate OFF, quality 1080p, sub vi/M, ask_resume+autoplay on, prefer_small off, handoff auto", defs?.auto_translate === false && defs.quality === "1080p" && defs.sub_lang === "vi" && defs.sub_size === "M" && defs.ask_resume === true && defs.autoplay_next === true && defs.prefer_small === false && defs.handoff_app === "auto", JSON.stringify(defs));
  check("settings: unknown tab → Hồ sơ", /data-settings="profile"/.test((await admin.get("/settings?tab=zzz")).text));

  // ---------- S2 prefs honoured (ONE real /api/sources; memoised 10 min) — skipped with QA_SKIP_REAL=1
  let hashes = [];
  const dt = (await admin.get("/api/me/device-token")).json;
  const token = dt.url.split("/stremio/")[1].split("/")[0];
  if (SKIP_REAL) note("QA_SKIP_REAL=1 → the real /api/sources + Stremio stream ordering checks are skipped (unit-tested in password-gate-csv-escape-stremio-rate-and-quality-order.test.ts)");
  else {
    await admin.patch("/api/me/settings", { quality: "2160p", show_4k: false });
    const src4k = await admin.get(`/api/sources?mediaKey=${SPIDER}`);
    const rel = src4k.json?.releases ?? [];
    check("quality=2160p → /api/sources lists 2160p rows (picker default shows 4K)", src4k.status === 200 && rel.some((r) => r.parsed?.resolution === "2160p"), `${src4k.status} n=${rel.length} best=${src4k.json?.best?.qualityLabel}`);
    const st4k = await admin.get(`/stremio/${token}/stream/movie/lumen:tmdbm634649.json`);
    const names4k = (st4k.json?.streams ?? []).filter((s) => s.url).map((s) => s.name.replace("\n", " "));
    const has4kCached = rel.some((r) => r.parsed?.resolution === "2160p" && r.cacheState === "cached");
    check("stremio stream: quality=2160p → every cached 2160p row leads the list (TV plays MKV/HEVC natively)", !has4kCached || (names4k[0] === "Lumen 2160p" && names4k.indexOf("Lumen 2160p") < names4k.findIndex((n) => n !== "Lumen 2160p") || names4k.every((n) => n === "Lumen 2160p")), names4k.join("|"));
    await admin.patch("/api/me/settings", { quality: "1080p" });
    const src1080 = await admin.get(`/api/sources?mediaKey=${SPIDER}`);
    check("quality=1080p → 2160p rows hidden again", src1080.status === 200 && src1080.json.releases.every((r) => r.parsed?.resolution !== "2160p"));
    hashes = src1080.json.releases.map((r) => r.hash);
    const st = await admin.get(`/stremio/${token}/stream/movie/lumen:tmdbm634649.json`);
    const streams = st.json?.streams ?? [];
    const cached = streams.filter((s) => s.url), uncached = streams.filter((s) => s.infoHash);
    check("stremio stream (real cached title): ≤5 cached rows {name, title ✅, url=/play?key&hash=40hex, behaviorHints} + ≤3 uncached infoHash rows, 1080p first, no secrets", st.status === 200 && cached.length >= 1 && cached.length <= 5 && uncached.length <= 3 && cached[0].name === "Lumen\n1080p" && cached.every((s) => /^Lumen\n\S+$/.test(s.name) && /Đã cache/.test(s.title) && new RegExp(`^${ENV.APP_URL ?? BASE}/stremio/${token}/play\\?key=movie%3A634649&hash=[0-9a-f]{40}$`).test(s.url) && typeof s.behaviorHints?.notWebReady === "boolean") && uncached.every((s) => /^[0-9a-f]{40}$/.test(s.infoHash) && !s.url) && noSecrets(st.text), `${st.status} cached=${cached.length} uncached=${uncached.length}`);
    note(`torbox calls after the sources + stream checks: ${(await calls(admin)) - calls0}`);
  }
  // subtitle prefs honoured by the player's search endpoint (sim rows, no provider)
  await admin.post("/api/dev/seed", { fixture: "subs", mediaKey: SPIDER });
  await admin.post("/api/dev/scenario", { flags: ["subs-sim=popover"] });
  await admin.patch("/api/me/settings", { sub_size: "L", sub_lang: "vi" });
  const sL = await admin.get(`/api/subs/search?mediaKey=${SPIDER}`);
  const viTrack = sL.json?.tracks?.find((t) => t.id === sL.json.selectedId);
  check("sub_size=L → per-title prefs.size defaults to L; sub_lang=vi → a vi track auto-selected", sL.status === 200 && sL.json.prefs?.size === "L" && viTrack?.lang === "vi", `${sL.status} size=${sL.json?.prefs?.size}`);
  await admin.patch("/api/me/settings", { sub_lang: "off" });
  const sOff = await admin.get(`/api/subs/search?mediaKey=${SPIDER}`);
  check("sub_lang=off → nothing auto-selected; auto_translate OFF → autoTranslate:false", (sOff.json?.selectedId === null || sOff.json?.selectedId === undefined) && sOff.json?.autoTranslate === false, String(sOff.json?.selectedId));
  await admin.patch("/api/me/settings", { sub_lang: "vi", sub_size: "M" });
  await admin.post("/api/dev/scenario", { flags: [] });

  // ---------- S3 temp password flow (quang)
  const users = (await admin.get("/api/admin/users")).json.members;
  const quang = users.find((u) => u.username === "quang");
  const reset = await admin.post(`/api/admin/users/${quang.id}/reset-password`);
  const temp = reset.json?.tempPassword;
  const t1 = client("Mozilla/5.0 (Macintosh) Safari/605");
  const tLogin = await t1.post("/api/auth/login", { username: "quang", password: temp, remember: false });
  const tSettings = await t1.get("/settings?tab=profile");
  check("temp password: login 200 + mustChangePassword:true; /settings shows the must-change note; password_reset_at stamped", tLogin.status === 200 && tLogin.json?.user?.mustChangePassword === true && /data-must-change/.test(tSettings.text) && q1("select password_reset_at as t from users where id = ?", quang.id).t > 0, `${tLogin.status}`);
  check("temp password: change → 204, flag + stamp cleared, note gone, temp refused, new accepted", (await t1.post("/api/me/password", { current: temp, next: "QuangMoi12345" })).status === 204 && (await t1.get("/api/me")).json?.user?.mustChangePassword === false && q1("select password_reset_at as t from users where id = ?", quang.id).t === null && !/data-must-change/.test((await t1.get("/settings?tab=profile")).text) && (await client().post("/api/auth/login", { username: "quang", password: temp })).status === 401 && (await client().post("/api/auth/login", { username: "quang", password: "QuangMoi12345" })).status === 200);
  check("password: next == current → 204 (allowed) or 400; never 500", [204, 400].includes((await t1.post("/api/me/password", { current: "QuangMoi12345", next: "QuangMoi12345" })).status));
  await admin.post("/api/dev/seed", { fixture: "reset-rate-limit" });

  // ---------- S4 lock → sessions + active jobs die instantly + Stremio token 404 → unlock restores
  const tTok = (await t1.get("/api/me/device-token")).json;
  const tToken = tTok.url.split("/stremio/")[1].split("/")[0];
  const anon = client();
  check("quang: live session + live Stremio manifest before the lock", (await t1.get("/api/me")).status === 200 && (await anon.get(`/stremio/${tToken}/manifest.json`)).status === 200);
  const queueBefore = (await admin.get("/api/admin/queue")).json;
  const victim = queueBefore.active.find((r) => r.requestedBy && r.requestedBy !== me.displayName);
  const victimUser = victim ? users.find((u) => u.displayName === victim.requestedBy) : null;
  await admin.patch("/api/admin/users", { id: quang.id, action: "lock" });
  const tPage = await t1.get("/");
  check("lock: quang's /api/me → 401 and a page → redirect to /login at once; manifest/catalog/play → 404", (await t1.get("/api/me")).status === 401 && [302, 307].includes(tPage.status) && /\/login/.test(tPage.headers.get("location") ?? "") && (await anon.get(`/stremio/${tToken}/manifest.json`)).status === 404 && (await anon.get(`/stremio/${tToken}/catalog/movie/lumen-trending-movie.json`)).status === 404, `${tPage.status} ${tPage.headers.get("location")}`);
  check("lock: admin stats/users show quang 'off' and the DB has 0 sessions for him", (await admin.get("/api/admin/users?filter=locked")).json.members.some((u) => u.username === "quang") && cnt("sessions", "user_id", quang.id) === 0);
  await admin.patch("/api/admin/users", { id: quang.id, action: "unlock" });
  check("unlock: the SAME Stremio token works again; login possible", (await anon.get(`/stremio/${tToken}/manifest.json`)).status === 200 && (await login(t1, "quang", "QuangMoi12345")) === 200);
  if (victimUser) {
    await admin.patch("/api/admin/users", { id: victimUser.id, action: "lock" });
    const after = (await admin.get("/api/admin/queue")).json;
    check(`lock cancels the member's queued / downloading jobs (${victim.requestedBy}: ${queueBefore.active.filter((r) => r.requestedBy === victim.requestedBy).length} active → 0)`, !after.active.some((r) => r.requestedBy === victim.requestedBy) && cnt("cloud_jobs", "user_id", victimUser.id) === q1("select count(*) as n from cloud_jobs where user_id = ? and state in ('ready','error')", victimUser.id).n, JSON.stringify(after.active.map((r) => [r.requestedBy, r.state])));
    await admin.patch("/api/admin/users", { id: victimUser.id, action: "unlock" });
  } else note("no fixture job owned by another member → lock-cancels-jobs check skipped");

  // ---------- S5 sessions across 2 devices + logout others
  const t2 = client("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605");
  await login(t2, "quang", "QuangMoi12345");
  const sess = (await t1.get("/api/me/sessions")).json;
  check("sessions: two real devices listed, exactly one current, distinct device labels", Array.isArray(sess) && sess.length === 2 && sess.filter((s) => s.current).length === 1 && new Set(sess.map((s) => s.deviceLabel)).size === 2, JSON.stringify(sess?.map((s) => [s.deviceLabel, s.current])));
  check("sessions: DELETE ?id of another user's session → 404 (cannot log others out)", (await admin.del(`/api/me/sessions?id=${encodeURIComponent(sess.find((s) => !s.current).id)}`)).status === 404);
  check("sessions: logout others from device 1 → device 2 is 401 immediately, device 1 still 200", (await t1.del("/api/me/sessions?others=1")).status === 204 && (await t2.get("/api/me")).status === 401 && (await t1.get("/api/me")).status === 200);
  check("sessions: ?others=1 then list has one row", (await t1.get("/api/me/sessions")).json.length === 1);

  // ---------- S6 delete cascade verified in SQLite
  await admin.post("/api/dev/seed", { fixture: "user", username: "qa_p6_del", displayName: "QA Del", password: "QaDelPass123", onboarded: true });
  const d = client("Mozilla/5.0 (Windows NT 10.0) Edge/130");
  await login(d, "qa_p6_del", "QaDelPass123");
  const did = (await d.get("/api/me")).json.user.id;
  await d.post("/api/my-list", { mediaKey: SPIDER });
  await d.post("/api/likes", { mediaKey: SPIDER });
  await d.post("/api/progress", { mediaKey: SPIDER, positionS: 30, durationS: 1000 });
  await d.patch("/api/subs/prefs", { mediaKey: SPIDER, size: "L" });
  await d.patch("/api/me/settings", { sub_size: "S" });
  await d.get("/api/me/device-token");
  let jobStatus = "skipped";
  if (hashes[1]) {
    await d.post("/api/dev/scenario", { flags: ["all-uncached", "cloud-sim=ready"] });
    jobStatus = (await d.post("/api/cloud/jobs", { mediaKey: SPIDER, hash: hashes[1] })).status;
  }
  await admin.post("/api/dev/seed", { fixture: "invite", state: "used", usedBy: "qa_p6_del" });
  for (let i = 0; i < 6 && cnt("notifications", "user_id", did) === 0; i++) await sleep(2000);
  const tables = { sessions: "sessions", tokens: "device_tokens", settings: "user_settings", notifications: "notifications", likes: "likes", myList: "my_list", progress: "progress", views: "views", jobs: "cloud_jobs", subPrefs: "subtitle_prefs" };
  const count = () => ({ ...Object.fromEntries(Object.entries(tables).map(([k, t]) => [k, cnt(t, "user_id", did)])), invitesUsedBy: cnt("invites", "used_by", did), activity: cnt("activity_log", "user_id", did) });
  const before = count();
  const expectRows = Object.entries(before).filter(([k]) => k !== "jobs" || hashes[1]);
  check(`cascade setup: every table has ≥ 1 row for the member (job ${jobStatus})`, expectRows.every(([, v]) => v >= 1), JSON.stringify(before));
  const nullActivityBefore = q1("select count(*) as n from activity_log where user_id is null").n;
  check("delete member → 204", (await admin.del(`/api/admin/users/${did}`, { confirm: "qa_p6_del" })).status === 204);
  const after = count();
  check("cascade: 0 rows left in sessions / device_tokens / user_settings / notifications / likes / my_list / progress / views / cloud_jobs / subtitle_prefs; invites.used_by + activity_log.user_id set NULL", Object.values(after).every((v) => v === 0) && q1("select count(*) as n from users where id = ?", did).n === 0 && q1("select count(*) as n from invites where used_by is null and note = 'fixture:used'").n >= 1 && q1("select count(*) as n from activity_log where user_id is null").n >= nullActivityBefore + before.activity, JSON.stringify(after));
  check("deleted member's session cookie → 401", (await d.get("/api/me")).status === 401);
  await admin.post("/api/dev/scenario", { flags: [] });

  // ---------- S7 member scoping extras + S8 invite validation
  const m = client();
  await login(m, "qa_p6x", "QaXPass123");
  check("member: POST /api/admin/invites, PATCH /api/admin/queue, DELETE|POST /api/admin/invites/1, POST /api/dev/seed → 403", (await m.post("/api/admin/invites", { note: "x" })).status === 403 && (await m.patch("/api/admin/queue", { id: 1, action: "prioritize" })).status === 403 && (await m.del("/api/admin/invites/1")).status === 403 && (await m.post("/api/admin/invites/1")).status === 403 && (await m.post("/api/dev/seed", { fixture: "clear-notifications" })).status === 403);
  check("member: page /admin/queue + /admin/activity → 403 box; /settings → own page", /Bạn không có quyền/.test((await m.get("/admin/queue")).text) && /Bạn không có quyền/.test((await m.get("/admin/activity")).text) && /data-settings="profile"/.test((await m.get("/settings")).text));
  check("invite create: expiresDays 5 → 400, note 81 chars → 400, maxUses 2 → 400", (await admin.post("/api/admin/invites", { note: "a", expiresDays: 5 })).status === 400 && (await admin.post("/api/admin/invites", { note: "a".repeat(81) })).status === 400 && (await admin.post("/api/admin/invites", { note: "a", maxUses: 2 })).status === 400);
  const multi = await admin.post("/api/admin/invites", { note: "Nhiều lần QA", expiresDays: 14, maxUses: null });
  const invRow = (await admin.get("/api/admin/invites")).json.invites.find((i) => i.id === multi.json?.id);
  check("invite create: multi-use 14 ngày → listed valid with url + maskedUrl; anon GET /api/invites/{token} → valid", multi.status === 200 && invRow?.state === "valid" && Boolean(invRow.url) && Math.round((Date.parse(invRow.expiresAt) - Date.now()) / 86_400_000) === 14 && (await anon.get(`/api/invites/${multi.json.url.split("/invite/")[1]}`)).json?.state === "valid", JSON.stringify(invRow)?.replace(/invite\/[^"]+/g, "invite/<t>"));
  await admin.del(`/api/admin/invites/${multi.json.id}`);

  // ---------- S9 queue live with cloud-sim (needs a real hash list → skipped with QA_SKIP_REAL)
  if (hashes[2] && hashes[3]) {
    await admin.post("/api/dev/seed", { fixture: "clear-cloud-jobs" });
    await admin.post("/api/dev/scenario", { flags: ["all-uncached", "cloud-sim=downloading:10:15"] });
    const live = await admin.post("/api/cloud/jobs", { mediaKey: SPIDER, hash: hashes[2] });
    const q0 = (await admin.get("/api/admin/queue")).json;
    const row0 = q0.active?.find((r) => r.id === live.json?.id);
    await sleep(11000);
    const q1r = (await admin.get("/api/admin/queue")).json;
    const row1 = q1r.active?.find((r) => r.id === live.json?.id);
    check("queue live (cloud-sim 10%+15/poll): row appears downloading with speed/eta labels and progresses between polls", live.status === 201 && row0?.state === "downloading" && typeof row0.speedLabel === "string" && typeof row0.etaLabel === "string" && row1 && row1.progress > row0.progress && q1r.slots.active >= 1, `${row0?.progress} → ${row1?.progress}`);
    check("queue: admin cancel (DELETE /api/cloud/jobs/[id]) → 204 and the row is gone", (await admin.del(`/api/cloud/jobs/${live.json.id}`)).status === 204 && !(await admin.get("/api/admin/queue")).json.active.some((r) => r.id === live.json.id));
    await admin.post("/api/dev/scenario", { flags: ["all-uncached", "cloud-sim=queued:10:10"] });
    const queued = await admin.post("/api/cloud/jobs", { mediaKey: SPIDER, hash: hashes[3] });
    const qq = (await admin.get("/api/admin/queue")).json.active.find((r) => r.id === queued.json?.id);
    check("queue: TorBox slots full (sim queued:10:10) → row 'queued' with slot counts (TorBox-side queue, no app position → no Ưu tiên)", [200, 201].includes(queued.status) && qq?.state === "queued" && qq.appQueuePos === null && (await admin.patch("/api/admin/queue", { id: queued.json.id, action: "prioritize" })).json?.code === "NOT_QUEUED", JSON.stringify(qq)?.slice(0, 160));
    await admin.post("/api/dev/scenario", { flags: [] });
    await admin.post("/api/dev/seed", { fixture: "clear-cloud-jobs" });
  } else note("QA_SKIP_REAL=1 → live cloud-sim queue checks skipped (fixture queue is covered by the main contract)");

  // ---------- S10 activity CSV + filters + formula escape
  await admin.post("/api/dev/seed", { fixture: "admin-data" });
  await admin.patch("/api/me/profile", { displayName: "=HYPERLINK(1)" });
  await admin.post("/api/admin/invites", { note: "QA csv", expiresDays: 7, maxUses: 1 }); // a row whose person + content cells both start with the formula name
  const csvAll = await admin.get("/api/admin/activity.csv");
  const lines = csvAll.text.replace(/^﻿/, "").split("\r\n").filter(Boolean);
  check("CSV: no API keys / session secret / 32-char tokens / CDN hosts inside; ≥ 9 lines; ISO timestamps", noSecrets(csvAll.text) && !/[A-Za-z0-9_-]{32}/.test(csvAll.text.replace(/^[^\n]*\n/, "")) && lines.length >= 9 && lines.slice(1).every((l) => /^\d{4}-\d\d-\d\dT/.test(l)), `${lines.length} lines`);
  check("CSV: cells starting with = are apostrophe-prefixed in the person AND content columns (no formula injection)", lines.some((l) => l.includes(",'=HYPERLINK(1),'=HYPERLINK(1) đã tạo link mời")) && !lines.some((l) => /(^|,)=HYPERLINK/.test(l)), lines.filter((l) => /HYPERLINK/.test(l)).join(" || ").slice(0, 200));
  await admin.patch("/api/me/profile", { displayName: me.displayName });
  check("CSV: month=2020-01 → header only; userId filter → only that person", (await admin.get("/api/admin/activity.csv?month=2020-01")).text.replace(/^﻿/, "").split("\r\n").filter(Boolean).length === 1 && (await admin.get(`/api/admin/activity.csv?userId=${quang.id}`)).text.split("\r\n").filter(Boolean).slice(1).every((l) => l.split(",")[2] === "Quang"));

  // ---------- S11 KPIs vs DB
  await admin.post("/api/dev/seed", { fixture: "admin-data" });
  const stats = (await admin.get("/api/admin/stats")).json;
  const now = Date.now();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const dbTotal = q1("select count(*) as n from users").n;
  const dbActive = q1("select count(*) as n from users where disabled = 0 and last_seen_at > ?", now - 30 * 86_400_000).n;
  const dbViews = q1("select count(*) as n from views where started_at >= ?", monthStart).n;
  const dbAi = q1("select count(*) as n, coalesce(sum(cost_vnd),0) as c from subtitle_cache where source = 'ai' and created_at >= ? and vtt_path != ''", monthStart);
  const dbViews30 = q1("select count(*) as n from views where started_at >= ?", now - 30 * 86_400_000).n;
  const dbActiveJobs = q1("select count(*) as n from cloud_jobs where state in ('queued','downloading') and app_queue_pos is null").n;
  const barsSum = stats.bars.reduce((a, b) => a + b.count, 0);
  check("KPIs vs DB: members total/active, views this month, AI count+cost, 30-day bars sum, torbox active slots, OS used ≤ 20", stats.members.total === dbTotal && stats.members.active === dbActive && stats.viewsMonth === dbViews && stats.ai.count === dbAi.n && stats.ai.costVnd === Number(dbAi.c) && barsSum === dbViews30 && stats.torbox.active === dbActiveJobs && stats.os.used >= 0 && stats.os.used <= 20, JSON.stringify({ api: { ...stats.members, v: stats.viewsMonth, ai: stats.ai, bars: barsSum, slots: stats.torbox.active }, db: { dbTotal, dbActive, dbViews, dbAi, dbViews30, dbActiveJobs } }));
  check("KPIs: watchingNow ×3 (fixture) with name/title/detail; plan label + limit ≥ active", stats.watchingNow.length === 3 && stats.watchingNow.every((w) => w.name && w.title && w.detail) && typeof stats.torbox.plan === "string" && stats.torbox.limit >= stats.torbox.active, JSON.stringify(stats.watchingNow));

  // ---------- S12 Stremio extras
  const mf = (await anon.get(`/stremio/${token}/manifest.json`)).json;
  const logo = await fetch(mf.logo.replace(/^https?:\/\/[^/]+/, BASE));
  check("manifest: description + logo (anonymous 200 image/png) + behaviorHints + catalogs with extra skip + resources objects {name,types,idPrefixes}; URLs built on APP_URL", typeof mf.description === "string" && logo.status === 200 && /image\/png/.test(logo.headers.get("content-type") ?? "") && mf.behaviorHints?.configurable === false && mf.catalogs.every((c) => c.extra?.some((e) => e.name === "skip")) && mf.resources.filter((r) => typeof r === "object").every((r) => r.name && r.types?.length && r.idPrefixes?.length) && mf.logo.startsWith(ENV.APP_URL ?? BASE), `${logo.status}`);
  const cat = (await anon.get(`/stremio/${token}/catalog/movie/lumen-trending-movie.json`)).json;
  check("catalog metas: https poster + Vietnamese name", cat.metas.every((x) => /^https:\/\//.test(x.poster ?? "") && x.name) && cat.metas.some((x) => /[ĂăÂâĐđÊêÔôƠơƯưÀ-ỹ]/.test(x.name)), JSON.stringify(cat.metas[0]).slice(0, 160));
  await admin.post("/api/my-list", { mediaKey: "tv:66732" });
  check("catalog my-list (series) → the member's tv item", (await anon.get(`/stremio/${token}/catalog/series/lumen-my-list.json`)).json?.metas?.some((x) => x.id === "lumen:tmdbt66732"));
  await admin.del("/api/my-list", { mediaKey: "tv:66732" });
  const metaS = (await anon.get(`/stremio/${token}/meta/series/lumen:tmdbt66732.json`)).json?.meta;
  check("meta series: poster/background/description + videos[{id,title,season,episode,released ISO}] (seasons fetched 4 at a time)", metaS && /^https:/.test(metaS.poster) && metaS.description && metaS.videos.length > 30 && metaS.videos.every((v) => v.title && Number.isInteger(v.season) && Number.isInteger(v.episode) && /^\d{4}-\d\d-\d\d/.test(v.released ?? "")), JSON.stringify(metaS?.videos?.[0]));
  const subs = (await admin.get(`/stremio/${token}/subtitles/movie/lumen:tmdbm634649.json`)).json;
  check("subtitles: every url is same-origin (APP_URL host) and .vtt", subs.subtitles.every((s) => s.url.startsWith(`${ENV.APP_URL ?? BASE}/stremio/${token}/subs/`) && /\.vtt$/.test(s.url)));
  await admin.post("/api/dev/scenario", { flags: ["play-sample", "stream-mode=proxy"] });
  const play = await fetch(`${BASE}/stremio/${token}/play?key=movie:634649&hash=sample`, { redirect: "manual", headers: { cookie: "lumen_scenario=play-sample,stream-mode=proxy" } });
  const fileUrl = play.headers.get("location").replace(/^https?:\/\/[^/]+/, BASE);
  const r2 = await fetch(fileUrl, { headers: { range: "bytes=100-199", cookie: "lumen_scenario=play-sample" } });
  const head = await fetch(fileUrl, { method: "HEAD", headers: { cookie: "lumen_scenario=play-sample" } });
  const r416 = await fetch(fileUrl, { headers: { range: "bytes=99999999999-", cookie: "lumen_scenario=play-sample" } });
  check("file route: Range 100-199 → 206 'bytes 100-199/N' 100 bytes; HEAD → content-length + accept-ranges; out-of-range → 416; exempt from the per-token limit", r2.status === 206 && /^bytes 100-199\/\d+$/.test(r2.headers.get("content-range") ?? "") && (await r2.arrayBuffer()).byteLength === 100 && head.status === 200 && Number(head.headers.get("content-length")) > 0 && head.headers.get("accept-ranges") === "bytes" && r416.status === 416, `${r2.status} ${r2.headers.get("content-range")} head=${head.status} 416=${r416.status}`);
  let fileOk = 0;
  for (let i = 0; i < 70; i++) if ((await fetch(fileUrl, { headers: { range: "bytes=0-0", cookie: "lumen_scenario=play-sample" } })).status === 206) fileOk++;
  check("file route: 70 Range requests in a row all answer 206 (players seek a lot; the handle is the capability)", fileOk === 70, String(fileOk));
  const direct = await fetch(`${BASE}/stremio/${token}/play?key=movie:634649&hash=sample`, { redirect: "manual", headers: { cookie: "lumen_scenario=play-sample,stream-mode=direct" } });
  check("play direct mode → 302 Location is NOT the token-bound file route", direct.status === 302 && !/\/stremio\/.*\/file\//.test(direct.headers.get("location") ?? ""));
  await admin.post("/api/dev/scenario", { flags: [] });
  await admin.post("/api/dev/seed", { fixture: "reset-rate-limit" });
  const rot = (await admin.post("/api/me/device-token")).json; // old token revoked
  check("revoked token → 404 on meta / subtitles / subs.vtt / file; OPTIONS still 204", (await anon.get(`/stremio/${token}/meta/movie/lumen:tmdbm634649.json`)).status === 404 && (await anon.get(`/stremio/${token}/subtitles/movie/lumen:tmdbm634649.json`)).status === 404 && (await anon.get(`/stremio/${token}/subs/1.vtt`)).status === 404 && (await anon.get(`/stremio/${token}/file/${"0".repeat(32)}`)).status === 404 && rot.revoked === false && (await fetch(`${BASE}/stremio/${token}/manifest.json`, { method: "OPTIONS" })).status === 204);

  // ---------- S13 health / robots / webmanifest
  const hAnon = await anon.get("/api/health");
  const h = await admin.get("/api/health");
  check("health: anonymous {ok:true} only + no-store; admin {ok,db,version,torbox{calls,retries,errors,lastRemaining},sweeper:false}", hAnon.status === 200 && Object.keys(hAnon.json).join() === "ok" && /no-store/.test(hAnon.headers.get("cache-control") ?? "") && h.json.db === true && typeof h.json.version === "string" && ["calls", "retries", "errors", "lastRemaining"].every((k) => k in h.json.torbox) && h.json.sweeper === false, hAnon.text);
  const wm = await anon.get("/manifest.webmanifest");
  check("webmanifest anonymous 200 JSON with icons; robots.txt Disallow /; icons anonymous; no X-Powered-By", wm.status === 200 && Array.isArray(wm.json?.icons) && wm.json.icons.length >= 2 && /Disallow: \//.test((await anon.get("/robots.txt")).text) && (await fetch(`${BASE}/icons/icon-192.png`)).status === 200 && wm.headers.get("x-powered-by") === null, `${wm.status}`);

  // ---------- S14 settings page content
  await admin.post("/api/dev/seed", { fixture: "os-quota", remaining: 19, resetInHours: 22 });
  const sp = (await admin.get("/settings?tab=subtitles")).text;
  const aiDb = q1("select count(*) as n, coalesce(sum(cost_vnd),0) as c from subtitle_cache where source = 'ai' and created_at >= ? and vtt_path != ''", monthStart);
  const aiText = /data-ai-month[^>]*>([^<]+)</.exec(sp)?.[1];
  check("settings subtitles: '1/20' + 'Đặt lại sau 22 giờ' + AI month text matches DB (N phim · cost đ)", /1\/20/.test(sp) && /Đặt lại sau 22 giờ/.test(sp) && aiText === `${aiDb.n} phim · ${Number(aiDb.c).toLocaleString("vi-VN")}đ`, `${aiText} vs db ${aiDb.n}/${aiDb.c}`);
  await admin.post("/api/dev/seed", { fixture: "os-quota", remaining: null });

  const torboxCalls = (await calls(admin)) - calls0;
  check(`TorBox calls during this script ≤ 2 — ${torboxCalls}`, torboxCalls <= 2);
  // cleanup
  await admin.post("/api/dev/seed", { fixture: "clear-subs", mediaKey: SPIDER });
  await admin.post("/api/dev/seed", { fixture: "clear-admin-data" });
  for (const u of ["qa_p6x", "qa_p6_del"]) await admin.post("/api/dev/seed", { fixture: "delete-user", username: u });
  await admin.post("/api/dev/seed", { fixture: "reset-rate-limit" });
  for (const c of [t1, t2, mx, m]) await c.post("/api/auth/logout").catch(() => {});
  await admin.post("/api/auth/logout");
  db.close();
  report.finish();
}
main().catch((err) => { console.error(err); process.exit(1); });
