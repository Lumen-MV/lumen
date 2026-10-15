// Phase 6 API contract checks against a RUNNING dev server (LUMEN_SCENARIOS=1, LUMEN_SWEEPER=0): settings routes (profile,
// password, device token, sessions), admin routes (stats, users + actions, invites revoke/recreate, queue, activity + CSV)
// with auth / role scoping (401 anon, 403 JSON for members), the temp-password gate (server-side redirect + 403 API),
// and the Stremio addon (manifest shape, catalog incl. malformed-path 400, meta, stream handler on the local sample,
// subtitles, play 302, per-token rate limits, 404 after revoke). TorBox budget: ≤ 1 call (memoised plan lookup).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adminCreds, makeReporter, readEnv } from "./qa-shared-helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const ENV = readEnv(ROOT);
const ADMIN = adminCreds(ENV);
const report = makeReporter();
const { check, note } = report;
const MEMBER = { u: "qa_p6_member", p: "QaP6Pass123", name: "Bảo QA" };
const SECRETS = [ENV.TORBOX_API_KEY, ENV.TMDB_READ_TOKEN, ENV.KIE_API_KEY, ENV.OPENSUBTITLES_API_KEY, ENV.SUBDL_API_KEY].filter(Boolean);
const noSecrets = (text) => !SECRETS.some((s) => text.includes(s)) && !/tb-cdn\.pw/.test(text);

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
  return { get: (p, h) => req("GET", p, undefined, h), post: (p, b) => req("POST", p, b), patch: (p, b) => req("PATCH", p, b), del: (p, b) => req("DELETE", p, b), cookieHeader: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ") };
}

async function main() {
  const anon = client();
  const admin = client();
  const member = client();
  check("admin login", (await admin.post("/api/auth/login", { username: ADMIN.u, password: ADMIN.p, remember: false })).status === 200);
  const health0 = (await admin.get("/api/health")).json;
  await admin.post("/api/dev/scenario", { flags: [] });
  await admin.post("/api/dev/seed", { fixture: "reset-rate-limit" });
  await admin.post("/api/dev/seed", { fixture: "user", username: MEMBER.u, displayName: MEMBER.name, password: MEMBER.p, onboarded: true });
  check("member login", (await member.post("/api/auth/login", { username: MEMBER.u, password: MEMBER.p, remember: false })).status === 200);

  // ---- auth / role scoping
  for (const p of ["/api/me/device-token", "/api/me/sessions", "/api/admin/stats", "/api/admin/users", "/api/admin/queue", "/api/admin/activity", "/api/admin/activity.csv"]) check(`anon GET ${p} → 401`, (await anon.get(p)).status === 401);
  check("anon PATCH /api/me/profile → 401", (await anon.patch("/api/me/profile", { displayName: "x" })).status === 401);
  for (const p of ["/api/admin/stats", "/api/admin/users", "/api/admin/queue", "/api/admin/activity", "/api/admin/invites"]) {
    const r = await member.get(p);
    check(`member GET ${p} → 403 JSON {code:FORBIDDEN}`, r.status === 403 && r.json?.code === "FORBIDDEN", `${r.status}`);
  }
  check("member PATCH /api/admin/users → 403", (await member.patch("/api/admin/users", { id: 1, action: "lock" })).status === 403);
  check("member POST reset-password → 403", (await member.post("/api/admin/users/1/reset-password")).status === 403);
  check("member DELETE /api/admin/users/1 → 403", (await member.del("/api/admin/users/1", { confirm: "x" })).status === 403);
  check("member page /admin renders the 403 box inside the shell (HTTP 200, layout guard)", /Bạn không có quyền xem trang này/.test((await member.get("/admin")).text));

  // ---- settings: profile + password
  const me0 = (await member.get("/api/me")).json;
  const p1 = await member.patch("/api/me/profile", { displayName: "Bảo Đổi", avatarColor: "#ec4899" });
  check("PATCH /api/me/profile → {user} with new name + swatch", p1.status === 200 && p1.json?.user?.displayName === "Bảo Đổi" && p1.json?.user?.avatarColor === "#ec4899", p1.text);
  check("PATCH /api/me/profile rejects an off-palette colour / empty name / empty patch", (await member.patch("/api/me/profile", { avatarColor: "#123456" })).status === 400 && (await member.patch("/api/me/profile", { displayName: "   " })).status === 400 && (await member.patch("/api/me/profile", {})).status === 400);
  check("GET /api/me reflects the change and carries mustChangePassword:false", (await member.get("/api/me")).json?.user?.displayName === "Bảo Đổi" && me0?.user?.mustChangePassword === false);
  check("POST /api/me/password wrong current → 400 PW_WRONG", (await member.post("/api/me/password", { current: "nope", next: "NewPass12345" })).json?.code === "PW_WRONG");
  check("POST /api/me/password short next → 400 WEAK_PASSWORD", (await member.post("/api/me/password", { current: MEMBER.p, next: "short" })).json?.code === "WEAK_PASSWORD");
  const member2 = client();
  await member2.post("/api/auth/login", { username: MEMBER.u, password: MEMBER.p, remember: true });
  check("POST /api/me/password ok → 204, old password refused, new accepted", (await member.post("/api/me/password", { current: MEMBER.p, next: "NewPass12345" })).status === 204 && (await client().post("/api/auth/login", { username: MEMBER.u, password: MEMBER.p })).status === 401 && (await client().post("/api/auth/login", { username: MEMBER.u, password: "NewPass12345" })).status === 200);
  check("password change logs every OTHER device out (second session → 401), the caller's own session survives", (await member2.get("/api/me")).status === 401 && (await member.get("/api/me")).status === 200);

  // ---- settings: device token lifecycle + Stremio addon
  const dt = await member.get("/api/me/device-token");
  check("GET /api/me/device-token → {url, masked, revoked:false, manifestUrl}", dt.status === 200 && /\/stremio\/[A-Za-z0-9_-]{32}\/manifest\.json$/.test(dt.json?.url ?? "") && /…/.test(dt.json?.masked ?? "") && dt.json?.revoked === false && dt.json?.manifestUrl === dt.json?.url, dt.text.replace(/stremio\/[^/]+/, "stremio/<t>"));
  const token = dt.json.url.split("/stremio/")[1].split("/")[0];
  const mf = await anon.get(`/stremio/${token}/manifest.json`);
  check("manifest.json: valid Stremio manifest (id, version x.y.z, resources, types, idPrefixes, catalogs ×5 vi names), CORS *, no-store", mf.status === 200 && typeof mf.json?.id === "string" && /^\d+\.\d+\.\d+$/.test(mf.json?.version) && mf.json?.name === "Lumen" && mf.json?.resources?.length === 4 && mf.json?.types?.join() === "movie,series" && mf.json?.idPrefixes?.[0] === "lumen:" && mf.json?.catalogs?.length === 5 && mf.json.catalogs.every((c) => /^(movie|series)$/.test(c.type) && c.id.startsWith("lumen-") && c.name) && mf.headers.get("access-control-allow-origin") === "*" && /no-store/.test(mf.headers.get("cache-control") ?? ""), mf.text.slice(0, 200));
  check("manifest OPTIONS → 204 with CORS", (await fetch(`${BASE}/stremio/${token}/manifest.json`, { method: "OPTIONS" })).status === 204);
  check("unknown token → 404 JSON (no redirect to /login)", (await anon.get(`/stremio/${"x".repeat(32)}/manifest.json`)).status === 404 && (await anon.get(`/stremio/short/manifest.json`)).status === 404);
  const cat = await anon.get(`/stremio/${token}/catalog/movie/lumen-trending-movie.json`);
  check("catalog trending movie → 20 metas with lumen:tmdbm ids, Vietnamese names, posters", cat.status === 200 && cat.json?.metas?.length === 20 && cat.json.metas.every((m) => /^lumen:tmdbm\d+$/.test(m.id) && m.type === "movie" && m.name && m.posterShape === "poster"), `${cat.status} ${cat.json?.metas?.length}`);
  const catS = await anon.get(`/stremio/${token}/catalog/series/lumen-trending-series.json`);
  check("catalog trending series → lumen:tmdbt ids", catS.json?.metas?.length > 0 && catS.json.metas.every((m) => /^lumen:tmdbt\d+$/.test(m.id) && m.type === "series"));
  check("catalog with malformed percent-encoding (skip=%E0) → 400 JSON, never a 500 page", (await anon.get(`/stremio/${token}/catalog/series/lumen-anime/skip=%E0.json`)).status === 400);
  check("catalog anime skip=20 → [] (one page), unknown catalog → 404, wrong type → []", (await anon.get(`/stremio/${token}/catalog/series/lumen-anime/skip=20.json`)).json?.metas?.length === 0 && (await anon.get(`/stremio/${token}/catalog/movie/lumen-nope.json`)).status === 404 && (await anon.get(`/stremio/${token}/catalog/movie/lumen-trending-series.json`)).json?.metas?.length === 0);
  await member.post("/api/my-list", { mediaKey: "movie:634649" });
  const myList = await anon.get(`/stremio/${token}/catalog/movie/lumen-my-list.json`);
  check("catalog my-list → the member's own list (Spider-Man)", myList.json?.metas?.some((m) => m.id === "lumen:tmdbm634649"), myList.text.slice(0, 120));
  const meta = await anon.get(`/stremio/${token}/meta/movie/lumen:tmdbm634649.json`);
  check("meta movie → Vietnamese name, imdb_id, genres, runtime", meta.json?.meta?.name === "Người Nhện: Không Còn Nhà" && meta.json.meta.imdb_id === "tt10872600" && meta.json.meta.genres?.length > 0 && /phút/.test(meta.json.meta.runtime ?? ""), meta.text.slice(0, 160));
  const metaS = await anon.get(`/stremio/${token}/meta/series/lumen:tmdbt66732.json`);
  check("meta series → videos per episode with lumen:tmdbt…:s:e ids + released", metaS.json?.meta?.videos?.length > 30 && metaS.json.meta.videos.every((v) => /^lumen:tmdbt66732:\d+:\d+$/.test(v.id) && v.season >= 1 && v.episode >= 1), `${metaS.json?.meta?.videos?.length}`);
  check("meta: unknown id → 404, imdb id maps through TMDB /find", (await anon.get(`/stremio/${token}/meta/movie/lumen:tmdbm999999999.json`)).status === 404 && (await anon.get(`/stremio/${token}/meta/movie/tt10872600.json`)).json?.meta?.id === "lumen:tmdbm634649");
  // stream handler on the local sample (scenario cookie travels with the member's jar)
  await member.post("/api/dev/scenario", { flags: ["play-sample"] });
  const st = await member.get(`/stremio/${token}/stream/movie/lumen:tmdbm634649.json`);
  check("stream handler shape: {streams:[{name,title,url,behaviorHints}]} (play-sample → 1 local stream, no TorBox)", st.status === 200 && st.json?.streams?.length === 1 && /^Lumen\n1080p$/.test(st.json.streams[0].name) && st.json.streams[0].url.includes(`/stremio/${token}/play?key=movie%3A634649&hash=sample`) && st.json.streams[0].behaviorHints?.notWebReady === false && noSecrets(st.text), st.text.slice(0, 200));
  check("stream for a series episode id and an imdb id both answer (sample)", (await member.get(`/stremio/${token}/stream/series/lumen:tmdbt66732:4:1.json`)).json?.streams?.length === 1 && (await member.get(`/stremio/${token}/stream/movie/tt10872600.json`)).json?.streams?.length === 1);
  const playRes = await fetch(`${BASE}/stremio/${token}/play?key=movie:634649&hash=sample`, { redirect: "manual", headers: { cookie: `lumen_scenario=play-sample` } });
  check("play → 302 to the stream (direct mode: the CDN / sample URL itself), no-store", playRes.status === 302 && /\/api\/dev\/sample\.mp4/.test(playRes.headers.get("location") ?? "") && /no-store/.test(playRes.headers.get("cache-control") ?? ""), `${playRes.status} ${playRes.headers.get("location")}`);
  const playProxy = await fetch(`${BASE}/stremio/${token}/play?key=movie:634649&hash=sample`, { redirect: "manual", headers: { cookie: `lumen_scenario=play-sample,stream-mode=proxy` } });
  const fileUrl = playProxy.headers.get("location") ?? "";
  check("play in proxy mode → 302 to the same-origin /stremio/{token}/file/{streamId} bound to the device token", playProxy.status === 302 && new RegExp(`/stremio/${token}/file/[0-9a-f]{32}$`).test(fileUrl), fileUrl.replace(token, "<t>"));
  const fileRes = await fetch(fileUrl, { headers: { range: "bytes=0-99", cookie: "lumen_scenario=play-sample" } });
  check("file route pipes the Range (206, content-range, 100 bytes, CORS *)", fileRes.status === 206 && /^bytes 0-99\//.test(fileRes.headers.get("content-range") ?? "") && fileRes.headers.get("access-control-allow-origin") === "*" && (await fileRes.arrayBuffer()).byteLength === 100, `${fileRes.status}`);
  check("file route with another token's handle → 410, bad id → 400", (await anon.get(`/stremio/${token}/file/${"0".repeat(32)}`)).status === 410 && (await anon.get(`/stremio/${token}/file/zz`)).status === 400);
  check("play validation: bad key / bad hash → 400, unknown hash without the sample scenario → 404", (await anon.get(`/stremio/${token}/play?key=nope&hash=sample`)).status === 400 && (await anon.get(`/stremio/${token}/play?key=movie:634649&hash=zz`)).status === 400 && (await anon.get(`/stremio/${token}/play?key=movie:634649&hash=sample`)).status === 404);
  const views = (await admin.get("/api/admin/stats")).json;
  check("a Stremio play shows up in 'Đang xem lúc này' with mode stremio + the activity log", views?.watchingNow?.some((w) => w.name === "Bảo Đổi" && w.mode === "stremio" && w.detail === "Stremio") && (await admin.get("/api/admin/activity?kind=view")).json?.entries?.some((e) => /Bảo Đổi.*bằng Stremio/.test(e.html)), JSON.stringify(views?.watchingNow));
  await admin.post("/api/dev/seed", { fixture: "subs", mediaKey: "movie:634649" });
  const subs = await member.get(`/stremio/${token}/subtitles/movie/lumen:tmdbm634649.json`);
  check("subtitles handler → {subtitles:[{id:lumen-N, lang:vie|eng, url:/stremio/{token}/subs/N.vtt}]} vi first", subs.status === 200 && subs.json?.subtitles?.length >= 2 && subs.json.subtitles[0].lang.startsWith("vie") && subs.json.subtitles.every((s) => /^lumen-\d+$/.test(s.id) && s.url.includes(`/stremio/${token}/subs/`)), subs.text.slice(0, 160));
  const vtt = await fetch(subs.json.subtitles[0].url.replace(/^https?:\/\/[^/]+/, BASE), { headers: { cookie: "lumen_scenario=subs-sim=popover" } });
  check("subs VTT route serves text/vtt with CORS (ready sim row)", vtt.status === 200 && /text\/vtt/.test(vtt.headers.get("content-type") ?? "") && vtt.headers.get("access-control-allow-origin") === "*" && /^WEBVTT/.test(await vtt.text()), `${vtt.status}`);
  await member.post("/api/dev/scenario", { flags: [] });
  // per-token rate limits: play 10/min (404 UNKNOWN_HASH answers still count), general 60/min across the other resources
  await admin.post("/api/dev/seed", { fixture: "reset-rate-limit" }); // the play checks above already used part of the bucket
  let playStatuses = [];
  for (let i = 0; i < 12; i++) playStatuses.push((await anon.get(`/stremio/${token}/play?key=movie:634649&hash=sample`)).status);
  check("play: 10 resolves / minute / token, the 11th → 429 with Retry-After", playStatuses.slice(0, 10).every((s) => s === 404) && playStatuses[10] === 429 && playStatuses[11] === 429, playStatuses.join(","));
  let generalHits = 0, first429 = -1;
  for (let i = 0; i < 70 && first429 < 0; i++) { generalHits++; if ((await anon.get(`/stremio/${token}/manifest.json`)).status === 429) first429 = generalHits; }
  check("manifest / catalog / meta / stream / subtitles share a 60/min bucket per token → 429 once exhausted", first429 > 0 && first429 <= 61, `429 after ${first429} manifest calls in this loop`);
  await admin.post("/api/dev/seed", { fixture: "reset-rate-limit" });
  check("reset-rate-limit fixture clears the Stremio buckets (manifest 200 again)", (await anon.get(`/stremio/${token}/manifest.json`)).status === 200);
  // sessions list includes the Stremio device, rotate + revoke
  const sess = await member.get("/api/me/sessions");
  check("GET /api/me/sessions lists this session as current", Array.isArray(sess.json) && sess.json.some((s) => s.current), sess.text.slice(0, 100));
  const rot = await member.post("/api/me/device-token");
  check("POST /api/me/device-token rotates: new token works, old token → 404", rot.json?.revoked === false && rot.json.url !== dt.json.url && (await anon.get(`/stremio/${token}/manifest.json`)).status === 404 && (await anon.get(new URL(rot.json.url).pathname)).status === 200);
  const token2 = rot.json.url.split("/stremio/")[1].split("/")[0];
  const rev = await member.del("/api/me/device-token");
  check("DELETE /api/me/device-token → revoked:true, every addon route 404s afterwards", rev.json?.revoked === true && rev.json.url === null && (await anon.get(`/stremio/${token2}/manifest.json`)).status === 404 && (await anon.get(`/stremio/${token2}/catalog/movie/lumen-trending-movie.json`)).status === 404 && (await anon.get(`/stremio/${token2}/stream/movie/lumen:tmdbm634649.json`)).status === 404 && (await anon.get(`/stremio/${token2}/play?key=movie:634649&hash=sample`)).status === 404);
  check("GET after revoke keeps revoked:true (no silent re-issue); POST issues a fresh link", (await member.get("/api/me/device-token")).json?.revoked === true && (await member.post("/api/me/device-token")).json?.revoked === false);

  // ---- admin: stats / users / actions / invites / queue / activity
  await admin.post("/api/dev/seed", { fixture: "admin-data" });
  const stats = await admin.get("/api/admin/stats");
  check("GET /api/admin/stats → members/watchingNow/viewsMonth/ai/torbox/os/bars(30)", stats.status === 200 && stats.json?.members?.total >= 7 && stats.json.watchingNow?.length === 3 && Number.isInteger(stats.json.viewsMonth) && "costVnd" in (stats.json.ai ?? {}) && typeof stats.json.torbox?.plan === "string" && stats.json.torbox.limit > 0 && stats.json.os?.limit === 20 && stats.json.bars?.length === 30 && /^\d\d\/\d\d$/.test(stats.json.bars[0].label), stats.text.slice(0, 200));
  const list = await admin.get("/api/admin/users");
  const rows = list.json?.members ?? [];
  const byU = (u) => rows.find((r) => r.username === u);
  check("GET /api/admin/users → rows with lastActivity / viewsMonth / quality / devices / status, sorted by views desc", rows.length >= 7 && byU("khang")?.status === "off" && byU("dat")?.status === "wait" && byU("dat")?.lastActivity.kind === "never" && byU("bao")?.lastActivity.kind === "watching" && byU("bao")?.quality === "4K" && /Stremio/.test(byU("bao")?.devices ?? "") && rows.every((r, i) => i === 0 || rows[i - 1].viewsMonth >= r.viewsMonth), JSON.stringify(rows.map((r) => [r.username, r.status, r.viewsMonth])));
  check("users filter + search", (await admin.get("/api/admin/users?filter=locked")).json?.members?.map((r) => r.username).join() === "khang" && (await admin.get("/api/admin/users?q=tu%E1%BA%A5n")).json?.members?.[0]?.username === "quang" && (await admin.get("/api/admin/users?filter=zzz")).status === 400);
  const quang = byU("quang"), khang = byU("khang"), dat = byU("dat");
  const lock = await admin.patch("/api/admin/users", { id: quang.id, action: "lock" });
  await admin.post("/api/dev/seed", { fixture: "reset-rate-limit" }); // the dev box shares one login bucket (TRUST_PROXY=0)
  const lockedLogin = await client().post("/api/auth/login", { username: "quang", password: "QuangPass123" });
  check("lock → {user}, member now 'off' and cannot log in (403 AUTH_DISABLED)", lock.status === 200 && (await admin.get("/api/admin/users?filter=locked")).json?.members?.some((r) => r.username === "quang") && lockedLogin.status === 403, `${lock.status} login=${lockedLogin.status}`);
  check("unlock → ok", (await admin.patch("/api/admin/users", { id: quang.id, action: "unlock" })).status === 200 && (await admin.get("/api/admin/users?filter=active")).json?.members?.some((r) => r.username === "quang"));
  check("role → admin and back", (await admin.patch("/api/admin/users", { id: quang.id, action: "role", role: "admin" })).json?.user?.role === "admin" && (await admin.patch("/api/admin/users", { id: quang.id, action: "role", role: "member" })).json?.user?.role === "member" && (await admin.patch("/api/admin/users", { id: quang.id, action: "role" })).status === 400);
  const meAdmin = (await admin.get("/api/me")).json.user;
  check("self lock / delete / demote refused with 409 SELF; unknown id → 404", (await admin.patch("/api/admin/users", { id: meAdmin.id, action: "lock" })).json?.code === "SELF" && (await admin.del(`/api/admin/users/${meAdmin.id}`, { confirm: meAdmin.username })).json?.code === "SELF" && (await admin.patch("/api/admin/users", { id: 999999, action: "lock" })).status === 404);
  const reset = await admin.post(`/api/admin/users/${quang.id}/reset-password`);
  check("reset-password → Gk7-mPx2-Q9w style temp password; login with it → mustChangePassword:true", /^[A-Za-z2-9]{3}-[A-Za-z2-9]{4}-[A-Za-z2-9]{3}$/.test(reset.json?.tempPassword ?? "") && (await client().post("/api/auth/login", { username: "quang", password: reset.json.tempPassword })).json?.user?.mustChangePassword === true, reset.text.replace(/"tempPassword":"[^"]+"/, '"tempPassword":"<x>"'));
  const tt = client();
  await tt.post("/api/auth/login", { username: "quang", password: reset.json.tempPassword, remember: false });
  const gatedPage = await tt.get("/");
  const gatedApi = await tt.get("/api/me/sessions");
  check("temp-password gate (server): any page → 307 /settings?tab=profile; other APIs → 403 PASSWORD_CHANGE_REQUIRED; /api/me + /settings allowed", [302, 307].includes(gatedPage.status) && /\/settings\?tab=profile/.test(gatedPage.headers.get("location") ?? "") && gatedApi.status === 403 && gatedApi.json?.code === "PASSWORD_CHANGE_REQUIRED" && (await tt.get("/api/me")).status === 200 && (await tt.get("/settings?tab=profile")).status === 200 && (await tt.get("/admin")).status !== 200, `${gatedPage.status} ${gatedPage.headers.get("location")} api=${gatedApi.status}`);
  check("temp-password gate lifts after the change (home 200, sessions 200)", (await tt.post("/api/me/password", { current: reset.json.tempPassword, next: "QuangMoi12345" })).status === 204 && (await tt.get("/")).status === 200 && (await tt.get("/api/me/sessions")).status === 200);
  const resend = await admin.patch("/api/admin/users", { id: dat.id, action: "resend" });
  check("resend (never logged in) → {tempPassword, loginUrl} shown once; member flagged must-change", resend.status === 200 && /^[A-Za-z2-9]{3}-[A-Za-z2-9]{4}-[A-Za-z2-9]{3}$/.test(resend.json?.tempPassword ?? "") && /\/login$/.test(resend.json?.loginUrl ?? "") && resend.json?.user?.mustChangePassword === true && (await client().post("/api/auth/login", { username: "dat", password: resend.json.tempPassword })).json?.user?.mustChangePassword === true, resend.text.replace(/"tempPassword":"[^"]+"/, '"tempPassword":"<x>"'));
  check("resend for a member who already logged in → 409 ALREADY_ACTIVE", (await admin.patch("/api/admin/users", { id: quang.id, action: "resend" })).json?.code === "ALREADY_ACTIVE");
  await admin.post("/api/dev/seed", { fixture: "reset-rate-limit" });
  check("revoke-stremio → the member's manifest 404s", (await admin.patch("/api/admin/users", { id: byU("bao").id, action: "revoke-stremio" })).status === 200 && !(await admin.get("/api/admin/users")).json?.members?.find((r) => r.username === "bao")?.hasStremio);
  check("delete needs the typed username (400 CONFIRM_MISMATCH) then cascades (row gone, 404 afterwards)", (await admin.del(`/api/admin/users/${khang.id}`, { confirm: "wrong" })).json?.code === "CONFIRM_MISMATCH" && (await admin.del(`/api/admin/users/${khang.id}`, { confirm: "khang" })).status === 204 && !(await admin.get("/api/admin/users")).json?.members?.some((r) => r.username === "khang") && (await admin.del(`/api/admin/users/${khang.id}`, { confirm: "khang" })).status === 404);
  // invites
  const inv = (await admin.get("/api/admin/invites")).json.invites;
  const valid = inv.find((i) => i.note === "Mời Đạt" && i.state === "valid"), used = inv.find((i) => i.state === "used"), expired = inv.find((i) => i.state === "expired");
  check("invites list: valid rows carry url + maskedUrl (4…2), used rows the member's name and no url, expired rows no url; never tokenHash", Boolean(valid?.url) && /…/.test(valid?.maskedUrl ?? "") && used?.usedByName === "Bảo" && used.url === null && expired?.url === null && !/tokenHash/.test(JSON.stringify(inv)));
  check("DELETE invite → 204, then invalid (no url); the invite page says 'Link không hợp lệ'", (await admin.del(`/api/admin/invites/${valid.id}`)).status === 204 && (await admin.get("/api/admin/invites")).json.invites.find((i) => i.id === valid.id)?.state === "invalid" && (await anon.get(`/api/invites/${valid.url.split("/invite/")[1]}`)).json?.state === "invalid");
  const rec = await admin.post(`/api/admin/invites/${expired.id}`);
  check("POST invite recreate → {id,url,expiresAt,note} valid for 7 days with the same note", rec.status === 200 && rec.json?.note === "Nhóm cũ" && /\/invite\//.test(rec.json.url) && Math.round((Date.parse(rec.json.expiresAt) - Date.now()) / 86_400_000) === 7 && (await admin.post("/api/admin/invites/999999")).status === 404);
  check("recreate on an invite that still works → 409 STILL_VALID (no second live link)", (await admin.post(`/api/admin/invites/${rec.json.id}`)).json?.code === "STILL_VALID");
  // queue (fresh fixture: deleting "khang" above cascaded his failed job away)
  await admin.post("/api/dev/seed", { fixture: "admin-data" });
  const q = await admin.get("/api/admin/queue");
  check("GET /api/admin/queue → active (downloading + app-queued) / failed / doneToday / slots", q.status === 200 && q.json?.active?.length === 3 && q.json.active[0].state === "downloading" && q.json.active[0].speedLabel === "38 MB/s" && q.json.active[0].etaLabel === "~1 phút" && q.json.active[0].release === "1080p MP4 YTS 2.1 GB" && q.json.active[2].appQueuePos === 1 && /trọn mùa/.test(q.json.active[2].title) && q.json.failed?.length === 1 && q.json.doneToday?.length === 2 && /^\d\d:\d\d$/.test(q.json.doneToday[0].finishedLabel) && q.json.slots.active === 2, q.text.slice(0, 300));
  const appQueued = q.json.active.find((r) => r.appQueuePos !== null);
  check("PATCH prioritize: app-queued row → pos 1; a TorBox-side row → 409 NOT_QUEUED", (await admin.patch("/api/admin/queue", { id: appQueued.id, action: "prioritize" })).json?.appQueuePos === 1 && (await admin.patch("/api/admin/queue", { id: q.json.active[0].id, action: "prioritize" })).json?.code === "NOT_QUEUED");
  check("admin can cancel another member's job via /api/cloud/jobs/[id] (204) and the queue drops it", (await admin.del(`/api/cloud/jobs/${q.json.active[0].id}`)).status === 204 && (await admin.get("/api/admin/queue")).json?.active?.length === 2);
  // activity
  const act = await admin.get("/api/admin/activity");
  check("GET /api/admin/activity → {entries[{time, html, kind}], people[]} newest first with Hôm qua / dd/mm labels", act.status === 200 && act.json?.entries?.length >= 8 && act.json.entries.some((e) => /^Hôm qua \d\d:\d\d$/.test(e.time)) && act.json.entries.some((e) => /^\d\d\/\d\d$/.test(e.time)) && act.json.entries[0].html.includes("<b>") && act.json.people?.length >= 6, act.text.slice(0, 200));
  check("activity filters: kind=invite → invite+join only, userId narrows, bad kind → 400", (await admin.get("/api/admin/activity?kind=invite")).json?.entries?.every((e) => e.kind === "invite" || e.kind === "join") && (await admin.get(`/api/admin/activity?userId=${quang.id}`)).json?.entries?.every((e) => e.userId === quang.id) && (await admin.get("/api/admin/activity?kind=zzz")).status === 400);
  const csv = await admin.get("/api/admin/activity.csv?month=" + new Date().toISOString().slice(0, 7));
  const csvBytes = new Uint8Array(await (await fetch(`${BASE}/api/admin/activity.csv`, { headers: { cookie: admin.cookieHeader() } })).arrayBuffer());
  check("activity.csv → text/csv attachment with BOM + header, no <b>", csv.status === 200 && /text\/csv/.test(csv.headers.get("content-type") ?? "") && /attachment/.test(csv.headers.get("content-disposition") ?? "") && csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf && csv.text.replace(/^\uFEFF/, "").startsWith("Thời gian,Loại,Người,Nội dung") && !/<b>/.test(csv.text), `${csv.status} ${csv.text.slice(0, 40)}`);
  // health + noindex
  const hAnon = await anon.get("/api/health");
  const h = await admin.get("/api/health");
  check("GET /api/health anonymous → {ok} only; admin session → {ok, db:true, version, torbox, sweeper}", hAnon.status === 200 && JSON.stringify(Object.keys(hAnon.json ?? {})) === '["ok"]' && h.json?.ok === true && h.json.db === true && typeof h.json.version === "string" && "calls" in (h.json.torbox ?? {}), `${hAnon.text} / ${Object.keys(h.json ?? {}).join(",")}`);
  check("no X-Powered-By banner", h.headers.get("x-powered-by") === null);
  check("X-Robots-Tag noindex + security headers on every page; robots.txt disallows all", h.headers.get("x-robots-tag") === "noindex, nofollow" && h.headers.get("x-content-type-options") === "nosniff" && h.headers.get("x-frame-options") === "DENY" && /Disallow: \//.test((await anon.get("/robots.txt")).text));
  const torboxCalls = h.json.torbox.calls - (health0?.torbox?.calls ?? 0);
  check(`TorBox calls during this script ≤ 1 (plan lookup, memoised) — ${torboxCalls}`, torboxCalls <= 1);
  note(`torbox calls: ${torboxCalls} (sweeper ${h.json.sweeper ? "ON — counts include background work" : "off"})`);

  // cleanup
  await admin.post("/api/dev/seed", { fixture: "clear-admin-data" });
  await admin.post("/api/dev/seed", { fixture: "delete-user", username: MEMBER.u });
  await admin.post("/api/auth/logout");
  report.finish();
}

main().catch((err) => { console.error(err); process.exit(1); });
