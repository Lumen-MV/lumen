// Phase 1 API contract checks against a RUNNING dev server (LUMEN_SCENARIOS=1).
//   node tests/qa-api-contract-phase1.mjs [--base http://localhost:3000]
// Reads ADMIN_USERNAME / ADMIN_PASSWORD from .env.local and never prints them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";

function readEnv() {
  const env = {};
  for (const f of [".env.local", ".env"]) {
    const p = path.join(ROOT, f);
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
const ENV = readEnv();
const ADMIN = { u: ENV.ADMIN_USERNAME, p: ENV.ADMIN_PASSWORD };
if (!ADMIN.u || !ADMIN.p) { console.error("missing admin creds in .env.local"); process.exit(2); }

const results = [];
let failures = 0;
function check(name, ok, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

/** Minimal client with a cookie jar per instance. */
function client(extraHeaders = {}) {
  const jar = new Map();
  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  async function req(method, p, body, opts = {}) {
    const headers = { ...extraHeaders, ...(opts.headers || {}) };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (jar.size) headers.cookie = cookieHeader();
    const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const [pair] = sc.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
      const maxAge = /max-age=(\d+)/i.exec(sc);
      if (maxAge && Number(maxAge[1]) === 0) jar.delete(k); else jar.set(k, v);
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
    return { status: res.status, json, text, setCookies, headers: res.headers };
  }
  return { req, jar, clear: () => jar.clear() };
}

// /api/dev/seed requires an admin session → dedicated seeder client, logged out again at the end
const seeder = client();
const seed = (fixture) => seeder.req("POST", "/api/dev/seed", fixture);

async function main() {
  const admin = client();
  const anon = client();
  const member = client();
  // NOTE: without TRUST_PROXY=1 (dev default) the server ignores x-forwarded-for → every client shares one rate-limit bucket
  const ip = (n) => ({ "x-forwarded-for": `10.9.9.${n}` });

  // the seeder shares the admin account, so the sessions section (DELETE ?others=1) kills it → re-login afterwards
  const seederLogin = async () => {
    const r = await seeder.req("POST", "/api/auth/login", { username: ADMIN.u, password: ADMIN.p, remember: false });
    if (r.status !== 200) { console.error(`seeder admin login failed: ${r.status} ${r.text}`); process.exit(2); }
  };
  await seederLogin();

  // ---- baseline cleanup
  await seed({ fixture: "reset-rate-limit" });
  await seed({ fixture: "delete-user", username: "qa_member" });
  await seed({ fixture: "delete-user", username: "qa_member2" });
  await seed({ fixture: "user", username: "qa_disabled", displayName: "Khang", password: "KhangPass123", disabled: true, onboarded: true });

  // ---- middleware: unauthenticated page → redirect /login ; api → 401 JSON
  {
    const r = await anon.req("GET", "/");
    check("middleware GET / anon → 307 to /login", r.status === 307 && /\/login$/.test(r.headers.get("location") || ""), `${r.status} ${r.headers.get("location")}`);
    const r2 = await anon.req("GET", "/settings?x=1");
    const loc = decodeURIComponent(r2.headers.get("location") || "");
    check("middleware GET /settings anon → /login?next=/settings?x=1", r2.status === 307 && loc.endsWith("/login?next=/settings?x=1"), `${r2.status} ${loc}`);
    const r3 = await anon.req("GET", "/api/me");
    check("middleware GET /api/me anon → 401 AUTH_REQUIRED", r3.status === 401 && r3.json?.code === "AUTH_REQUIRED", `${r3.status} ${r3.text}`);
    const r4 = await anon.req("GET", "/api/admin/invites");
    check("middleware GET /api/admin/invites anon → 401", r4.status === 401, `${r4.status}`);
    const r5 = await anon.req("GET", "/admin");
    check("middleware GET /admin anon → 307 /login?next=/admin", r5.status === 307 && /next=%2Fadmin|next=\/admin/.test(r5.headers.get("location") || ""), `${r5.status} ${r5.headers.get("location")}`);
    const r6 = await anon.req("GET", "/login");
    check("GET /login anon → 200", r6.status === 200, `${r6.status}`);
    const r7 = await anon.req("GET", "/api/health");
    check("GET /api/health → 200 {ok:true}", r7.status === 200 && r7.json?.ok === true, r7.text);
  }

  // ---- login: 401 / bad body
  {
    const c = client(ip(1));
    const r = await c.req("POST", "/api/auth/login", { username: ADMIN.u, password: "wrong-" + Date.now(), remember: true });
    check("login wrong password → 401 AUTH_INVALID", r.status === 401 && r.json?.code === "AUTH_INVALID", `${r.status} ${r.text}`);
    const r2 = await c.req("POST", "/api/auth/login", { username: "nobody_" + Date.now(), password: "x".repeat(10), remember: true });
    check("login unknown user → 401 AUTH_INVALID", r2.status === 401 && r2.json?.code === "AUTH_INVALID", `${r2.status}`);
    const r3 = await c.req("POST", "/api/auth/login", { username: "" });
    check("login invalid body → 400", r3.status === 400, `${r3.status} ${r3.text}`);
    const r4 = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json", ...ip(1) }, body: "{not json" });
    check("login malformed JSON → 400", r4.status === 400, `${r4.status}`);
  }

  // ---- login: 403 disabled
  {
    const c = client(ip(2));
    const r = await c.req("POST", "/api/auth/login", { username: "qa_disabled", password: "KhangPass123", remember: true });
    check("login disabled user → 403 AUTH_DISABLED", r.status === 403 && r.json?.code === "AUTH_DISABLED", `${r.status} ${r.text}`);
    check("login disabled → no session cookie", !r.setCookies.some((s) => s.startsWith("lumen_session=")), r.setCookies.join(" | "));
  }

  // ---- login: 429 after 5 failures (one shared bucket in dev: reset first because the sections above already failed twice)
  {
    await seed({ fixture: "reset-rate-limit" });
    const c = client(ip(3));
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const r = await c.req("POST", "/api/auth/login", { username: ADMIN.u, password: "bad-" + i, remember: true });
      statuses.push(r.status + (r.json?.code ? ":" + r.json.code : ""));
      if (r.status === 429) {
        check(`login 429 carries retryAfterS (attempt ${i + 1})`, Number.isInteger(r.json?.retryAfterS) && r.json.retryAfterS > 0 && r.json.retryAfterS <= 300, r.text);
        break;
      }
    }
    check("login 5 failures → 429 AUTH_RATE", statuses.filter((s) => s.startsWith("401")).length === 4 && statuses[4]?.startsWith("429:AUTH_RATE"), statuses.join(","));
    const good = await c.req("POST", "/api/auth/login", { username: ADMIN.u, password: ADMIN.p, remember: true });
    check("login correct creds while rate-limited → still 429", good.status === 429, `${good.status}`);
    const other = client(ip(4));
    const r2 = await other.req("POST", "/api/auth/login", { username: ADMIN.u, password: "bad", remember: true });
    check("x-forwarded-for ignored without TRUST_PROXY=1 (other XFF → still 429, not a bypass)", r2.status === 429, `${r2.status}`);
    await seed({ fixture: "reset-rate-limit" });
    const after = await c.req("POST", "/api/auth/login", { username: ADMIN.u, password: "bad", remember: true });
    check("reset-rate-limit fixture clears the block", after.status === 401, `${after.status}`);
    await seed({ fixture: "reset-rate-limit" });
  }

  // ---- login: cookie attributes remember=true vs false
  {
    const c1 = client(ip(5));
    const r1 = await c1.req("POST", "/api/auth/login", { username: ADMIN.u, password: ADMIN.p, remember: true });
    const sc1 = r1.setCookies.find((s) => s.startsWith("lumen_session=")) || "";
    const maxAge = Number(/max-age=(\d+)/i.exec(sc1)?.[1]);
    check("login remember=true → 200 {user}", r1.status === 200 && r1.json?.user?.username === ADMIN.u, `${r1.status}`);
    check("remember=true cookie Max-Age ≈ 30d (2592000)", maxAge === 2592000, `max-age=${maxAge}`);
    check("cookie HttpOnly + SameSite=Lax + Path=/", /httponly/i.test(sc1) && /samesite=lax/i.test(sc1) && /path=\//i.test(sc1), sc1.replace(/lumen_session=[^;]+/, "lumen_session=<redacted>"));
    check("cookie not Secure in dev (http)", !/;\s*secure/i.test(sc1), "");
    const c2 = client(ip(5));
    const r2 = await c2.req("POST", "/api/auth/login", { username: ADMIN.u, password: ADMIN.p, remember: false });
    const sc2 = r2.setCookies.find((s) => s.startsWith("lumen_session=")) || "";
    check("remember=false → session cookie (no Max-Age/Expires)", r2.status === 200 && !/max-age=|expires=/i.test(sc2), sc2.replace(/lumen_session=[^;]+/, "lumen_session=<redacted>"));
    const c3 = client(ip(5));
    const r3 = await c3.req("POST", "/api/auth/login", { username: ADMIN.u, password: ADMIN.p });
    check("remember omitted → defaults to 30d (spec default?)", r3.status === 200, `max-age present: ${/max-age=/i.test(r3.setCookies.join())}`);
    // clean the extra sessions created above
    await c1.req("POST", "/api/auth/logout");
    await c2.req("POST", "/api/auth/logout");
    await c3.req("POST", "/api/auth/logout");
  }

  // ---- admin session for the rest
  {
    const r = await admin.req("POST", "/api/auth/login", { username: ADMIN.u, password: ADMIN.p, remember: true });
    check("admin login", r.status === 200 && r.json?.user?.role === "admin", `${r.status}`);
  }

  // ---- /api/me shape
  {
    const r = await admin.req("GET", "/api/me");
    const u = r.json?.user || {};
    const keys = ["id", "username", "displayName", "avatarColor", "role", "onboarded"];
    check("GET /api/me → user has exact public keys", r.status === 200 && keys.every((k) => k in u) && Object.keys(u).length === keys.length, JSON.stringify(Object.keys(u)));
    check("GET /api/me → no passwordHash leak", !("passwordHash" in u) && !/password/i.test(r.text), "");
    check("GET /api/me → settings object + unreadNotifications number + activeCloudJobs 0", typeof r.json?.settings === "object" && typeof r.json?.unreadNotifications === "number" && r.json?.activeCloudJobs === 0, JSON.stringify({ s: r.json?.settings, n: r.json?.unreadNotifications, j: r.json?.activeCloudJobs }));
  }

  // ---- PATCH /api/me/settings
  {
    const r = await admin.req("PATCH", "/api/me/settings", { quality: "2160p", sub_lang: "en", auto_translate: false });
    check("PATCH settings valid → 200 {settings}", r.status === 200 && r.json?.settings?.quality === "2160p" && r.json?.settings?.sub_lang === "en" && r.json?.settings?.auto_translate === false, r.text);
    const me = await admin.req("GET", "/api/me");
    check("PATCH settings persisted in GET /api/me", me.json?.settings?.quality === "2160p" && me.json?.settings?.sub_lang === "en", JSON.stringify(me.json?.settings));
    const bad = await admin.req("PATCH", "/api/me/settings", { quality: "720p" });
    check("PATCH settings invalid enum → 400", bad.status === 400, `${bad.status} ${bad.text}`);
    const unknown = await admin.req("PATCH", "/api/me/settings", { not_a_key: 1 });
    check("PATCH settings unknown key → 400 or ignored (report)", unknown.status === 400 || unknown.status === 200, `${unknown.status} ${unknown.text}`);
    const onboardedFalse = await admin.req("PATCH", "/api/me/settings", { onboarded: false });
    check("PATCH settings onboarded:false → 400 (only true allowed)", onboardedFalse.status === 400, `${onboardedFalse.status}`);
    await admin.req("PATCH", "/api/me/settings", { quality: "1080p", sub_lang: "vi", auto_translate: true });
  }

  // ---- sessions GET / DELETE
  {
    const second = client();
    await second.req("POST", "/api/auth/login", { username: ADMIN.u, password: ADMIN.p, remember: false });
    const list = await admin.req("GET", "/api/me/sessions");
    const arr = Array.isArray(list.json) ? list.json : [];
    check("GET /api/me/sessions → array with exactly one current:true", arr.filter((s) => s.current).length === 1 && arr.every((s) => "id" in s && "deviceLabel" in s && "lastSeenAt" in s), JSON.stringify(arr.map((s) => ({ d: s.deviceLabel, c: s.current }))));
    // target `second`'s own session (the admin account also has the seeder's session alive)
    const otherId = ((await second.req("GET", "/api/me/sessions")).json || []).find((s) => s.current)?.id;
    const del = await admin.req("DELETE", `/api/me/sessions?id=${encodeURIComponent(otherId || "")}`);
    check("DELETE /api/me/sessions?id=<other> → 204", del.status === 204, `${del.status} ${del.text}`);
    const afterDel = await second.req("GET", "/api/me");
    check("deleted session can no longer call /api/me (401)", afterDel.status === 401, `${afterDel.status}`);
    const bogus = await admin.req("DELETE", `/api/me/sessions?id=does-not-exist`);
    check("DELETE unknown id → 404", bogus.status === 404, `${bogus.status}`);
    const noId = await admin.req("DELETE", `/api/me/sessions`);
    check("DELETE without id → 400", noId.status === 400, `${noId.status}`);
    const third = client();
    await third.req("POST", "/api/auth/login", { username: ADMIN.u, password: ADMIN.p, remember: false });
    const others = await admin.req("DELETE", `/api/me/sessions?others=1`);
    const left = await admin.req("GET", "/api/me/sessions");
    check("DELETE ?others=1 → 204 and only current remains", others.status === 204 && Array.isArray(left.json) && left.json.length === 1 && left.json[0].current, `${others.status} left=${left.json?.length}`);
    await seederLogin();
  }

  // ---- admin invites create + list
  let validToken = "", expiredToken = "", usedToken = "";
  {
    const r = await admin.req("POST", "/api/admin/invites", { note: "qa", expiresDays: 7, maxUses: 1 });
    check("POST /api/admin/invites → {id,url,expiresAt}", r.status === 200 && Number.isInteger(r.json?.id) && /\/invite\/[A-Za-z0-9_-]{20,}$/.test(r.json?.url || "") && !isNaN(Date.parse(r.json?.expiresAt)), r.text.replace(/invite\/[^"]+/, "invite/<token>"));
    validToken = (r.json?.url || "").split("/invite/")[1] || "";
    const bad = await admin.req("POST", "/api/admin/invites", { expiresDays: 5 });
    check("POST /api/admin/invites expiresDays=5 → 400", bad.status === 400, `${bad.status}`);
    const list = await admin.req("GET", "/api/admin/invites");
    check("GET /api/admin/invites → {invites:[…]} contains new invite w/ state valid", Array.isArray(list.json?.invites) && list.json.invites.some((i) => i.id === r.json?.id && i.state === "valid"), `${list.status}`);
    check("GET /api/admin/invites never returns tokenHash/token", !/tokenHash|"token"/.test(list.text), "");
    expiredToken = (await seed({ fixture: "invite", state: "expired" })).json?.token || "";
    usedToken = (await seed({ fixture: "invite", state: "used" })).json?.token || "";
  }

  // ---- invite validate 4 states
  {
    const v = await anon.req("GET", `/api/invites/${validToken}`);
    check("GET /api/invites/<valid> → {state:valid, inviterName, daysLeft}", v.status === 200 && v.json?.state === "valid" && typeof v.json?.inviterName === "string" && v.json.inviterName.length > 0 && v.json?.daysLeft === 7, v.text);
    const e = await anon.req("GET", `/api/invites/${expiredToken}`);
    check("GET /api/invites/<expired> → {state:expired, expiredDaysAgo:2}", e.json?.state === "expired" && e.json?.expiredDaysAgo === 2, e.text);
    const u = await anon.req("GET", `/api/invites/${usedToken}`);
    check("GET /api/invites/<used> → {state:used, usedBy, usedAt}", u.json?.state === "used" && typeof u.json?.usedBy === "string" && !isNaN(Date.parse(u.json?.usedAt)), u.text);
    const i = await anon.req("GET", `/api/invites/${"x".repeat(32)}`);
    check("GET /api/invites/<garbage> → {state:invalid}", i.status === 200 && i.json?.state === "invalid", i.text);
    const short = await anon.req("GET", `/api/invites/abc`);
    check("GET /api/invites/abc (too short) → invalid, not 500", short.status === 200 && short.json?.state === "invalid", `${short.status} ${short.text}`);
    const sqlish = await anon.req("GET", `/api/invites/${encodeURIComponent("' OR 1=1 --")}`);
    check("GET /api/invites/<sql-ish> → invalid, not 500", sqlish.status === 200 && sqlish.json?.state === "invalid", `${sqlish.status}`);
  }

  // ---- username-available
  {
    const taken = await anon.req("GET", `/api/username-available?u=${encodeURIComponent(ADMIN.u)}&name=${encodeURIComponent("Bảo")}`);
    check("username-available taken → {available:false, suggestions:[u2, slug]}", taken.json?.available === false && Array.isArray(taken.json?.suggestions) && taken.json.suggestions.includes(`${ADMIN.u}2`) && taken.json.suggestions.length >= 1, taken.text.replace(ADMIN.u, "<admin>"));
    const upper = await anon.req("GET", `/api/username-available?u=${encodeURIComponent(ADMIN.u.toUpperCase())}`);
    check("username-available is case-insensitive (UPPER of taken → false)", upper.json?.available === false, upper.text.replace(new RegExp(ADMIN.u, "i"), "<admin>"));
    const free = await anon.req("GET", `/api/username-available?u=qa_member`);
    check("username-available free → {available:true, suggestions:[]}", free.json?.available === true && free.json?.suggestions?.length === 0, free.text);
    const bad = await anon.req("GET", `/api/username-available?u=${encodeURIComponent("Hi-ếu")}`);
    check("username-available invalid chars → available:false valid:false", bad.json?.available === false && bad.json?.valid === false, bad.text);
    const empty = await anon.req("GET", `/api/username-available`);
    check("username-available no param → 200 not 500", empty.status === 200, `${empty.status}`);
  }

  // ---- accept-invite error paths
  {
    const base = { token: validToken, displayName: "QA", username: "qa_member", password: "QaPass12345" };
    const weak = await anon.req("POST", "/api/auth/accept-invite", { ...base, password: "short1" });
    check("accept-invite weak password → 400 WEAK_PASSWORD", weak.status === 400 && weak.json?.code === "WEAK_PASSWORD", `${weak.status} ${weak.text}`);
    const badU = await anon.req("POST", "/api/auth/accept-invite", { ...base, username: "Bad Name!" });
    check("accept-invite bad username → 400 BAD_USERNAME", badU.status === 400 && badU.json?.code === "BAD_USERNAME", `${badU.status} ${badU.text}`);
    const taken = await anon.req("POST", "/api/auth/accept-invite", { ...base, username: ADMIN.u });
    check("accept-invite taken username → 409 USERNAME_TAKEN + suggestions", taken.status === 409 && taken.json?.code === "USERNAME_TAKEN" && Array.isArray(taken.json?.suggestions) && taken.json.suggestions.length > 0, taken.text.replace(ADMIN.u, "<admin>"));
    const used = await anon.req("POST", "/api/auth/accept-invite", { ...base, token: usedToken });
    check("accept-invite used token → 410 INVITE_USED", used.status === 410 && used.json?.code === "INVITE_USED", `${used.status} ${used.text}`);
    const exp = await anon.req("POST", "/api/auth/accept-invite", { ...base, token: expiredToken });
    check("accept-invite expired token → 410 INVITE_EXPIRED", exp.status === 410 && exp.json?.code === "INVITE_EXPIRED", `${exp.status} ${exp.text}`);
    const inv = await anon.req("POST", "/api/auth/accept-invite", { ...base, token: "x".repeat(32) });
    check("accept-invite invalid token → 4xx INVITE_INVALID (contract silent; got)", inv.status >= 400 && inv.status < 500 && inv.json?.code === "INVITE_INVALID", `${inv.status} ${inv.text}`);
    const stillValid = await anon.req("GET", `/api/invites/${validToken}`);
    check("failed accepts do not consume the invite", stillValid.json?.state === "valid", stillValid.text);
    const missing = await anon.req("POST", "/api/auth/accept-invite", { token: validToken });
    check("accept-invite missing fields → 400", missing.status === 400, `${missing.status}`);
    const emptyName = await anon.req("POST", "/api/auth/accept-invite", { ...base, displayName: "   " });
    check("accept-invite whitespace displayName → 400", emptyName.status === 400, `${emptyName.status} ${emptyName.text}`);
  }

  // ---- accept-invite success → logged in, onboarded=false, invite consumed, inviter notified
  {
    const before = (await admin.req("GET", "/api/me")).json?.unreadNotifications ?? 0;
    const r = await member.req("POST", "/api/auth/accept-invite", { token: validToken, displayName: "QA Member", username: "QA_Member", password: "QaPass12345" });
    check("accept-invite ok → 200 {user} role member onboarded=false, username lowercased", r.status === 200 && r.json?.user?.role === "member" && r.json?.user?.onboarded === false && r.json?.user?.username === "qa_member", r.text);
    const sc = r.setCookies.find((s) => s.startsWith("lumen_session=")) || "";
    check("accept-invite sets 30d session cookie", /max-age=2592000/i.test(sc), sc.replace(/lumen_session=[^;]+/, "lumen_session=<redacted>"));
    const me = await member.req("GET", "/api/me");
    check("member GET /api/me works with the new cookie", me.status === 200 && me.json?.user?.username === "qa_member", `${me.status}`);
    const v = await anon.req("GET", `/api/invites/${validToken}`);
    check("invite now {state:used, usedBy:'qa_member'}", v.json?.state === "used" && v.json?.usedBy === "qa_member", v.text);
    const again = await anon.req("POST", "/api/auth/accept-invite", { token: validToken, displayName: "X", username: "qa_member2", password: "QaPass12345" });
    check("reusing the consumed invite → 410 INVITE_USED", again.status === 410 && again.json?.code === "INVITE_USED", `${again.status} ${again.text}`);
    const after = (await admin.req("GET", "/api/me")).json?.unreadNotifications ?? 0;
    check("inviter unreadNotifications incremented (member_joined)", after === before + 1, `${before} → ${after}`);
  }

  // ---- member on admin API → 403 JSON ; admin page as member handled in Playwright
  {
    const r = await member.req("GET", "/api/admin/invites");
    check("member GET /api/admin/invites → 403 {code:FORBIDDEN}", r.status === 403 && r.json?.code === "FORBIDDEN", `${r.status} ${r.text}`);
    const r2 = await member.req("POST", "/api/admin/invites", { note: "x" });
    check("member POST /api/admin/invites → 403 JSON", r2.status === 403 && r2.json?.code === "FORBIDDEN", `${r2.status} ${r2.text}`);
    const page = await member.req("GET", "/admin");
    check("member GET /admin page → 200 with 403 box (not redirect)", page.status === 200 && page.text.includes("Bạn không có quyền xem trang này"), `${page.status}`);
    const ob = await member.req("PATCH", "/api/me/settings", { quality: "1080p", onboarded: true });
    const me = await member.req("GET", "/api/me");
    check("member PATCH onboarded:true persists", ob.status === 200 && me.json?.user?.onboarded === true, `${ob.status} ${me.json?.user?.onboarded}`);
    const dt = await member.req("GET", "/api/me/device-token");
    check("GET /api/me/device-token → {manifestUrl} /stremio/<token>/manifest.json", dt.status === 200 && /\/stremio\/[A-Za-z0-9_-]+\/manifest\.json$/.test(dt.json?.manifestUrl || ""), dt.text.replace(/stremio\/[^/]+/, "stremio/<token>"));
    const dt2 = await member.req("GET", "/api/me/device-token");
    check("device-token is stable across calls", dt.json?.manifestUrl === dt2.json?.manifestUrl, "");
  }

  // ---- disabled mid-session: lock = sessions deleted?
  {
    const c = client();
    await c.req("POST", "/api/auth/login", { username: "qa_disabled", password: "KhangPass123", remember: true }); // 403 — no cookie
    await seed({ fixture: "user", username: "qa_disabled", displayName: "Khang", password: "KhangPass123", disabled: false, onboarded: true });
    const ok = await c.req("POST", "/api/auth/login", { username: "qa_disabled", password: "KhangPass123", remember: true });
    check("re-enabled user can log in", ok.status === 200, `${ok.status}`);
    await seed({ fixture: "user", username: "qa_disabled", displayName: "Khang", password: "KhangPass123", disabled: true, onboarded: true });
    const me = await c.req("GET", "/api/me");
    check("user disabled while logged in → /api/me 401 (session rejected)", me.status === 401, `${me.status}`);
    const page = await c.req("GET", "/");
    check("disabled user GET / → redirected to /login", page.status === 307 && /\/login/.test(page.headers.get("location") || ""), `${page.status} ${page.headers.get("location")}`);
  }

  // ---- logout 204 + cookie cleared + session row gone
  {
    const r = await member.req("POST", "/api/auth/logout");
    const sc = r.setCookies.find((s) => s.startsWith("lumen_session=")) || "";
    check("POST /api/auth/logout → 204", r.status === 204, `${r.status}`);
    check("logout clears cookie (Max-Age=0)", /max-age=0/i.test(sc), sc.replace(/lumen_session=[^;]+/, "lumen_session=<redacted>"));
    const me = await member.req("GET", "/api/me");
    check("after logout GET /api/me → 401", me.status === 401, `${me.status}`);
    const anonLogout = await anon.req("POST", "/api/auth/logout");
    check("logout without session → 204 (idempotent)", anonLogout.status === 204, `${anonLogout.status}`);
    const stale = client();
    stale.jar.set("lumen_session", "Fe26.2**garbage");
    const st = await stale.req("GET", "/api/me");
    check("garbage cookie → 401 not 500", st.status === 401, `${st.status}`);
  }

  // ---- dev routes with LUMEN_SCENARIOS=1 (dev server) — note they are public
  {
    const r = await anon.req("POST", "/api/dev/scenario", { flags: ["offline"] });
    check("POST /api/dev/scenario (dev) → 200 sets lumen_scenario", r.status === 200 && r.setCookies.some((s) => s.startsWith("lumen_scenario=offline")), `${r.status}`);
    const bad = await anon.req("POST", "/api/dev/scenario", { flags: ["nope"] });
    check("POST /api/dev/scenario unknown flag → 400", bad.status === 400, `${bad.status}`);
    const ui = await anon.req("GET", "/dev/ui");
    check("GET /dev/ui anon → redirect to /login (dev page is auth-gated)", ui.status === 307, `${ui.status}`);
    const anonSeed = await anon.req("POST", "/api/dev/seed", { fixture: "reset-rate-limit" });
    check("POST /api/dev/seed anon → 401 AUTH_REQUIRED (admin session required even with LUMEN_SCENARIOS=1)", anonSeed.status === 401 && anonSeed.json?.code === "AUTH_REQUIRED", `${anonSeed.status} ${anonSeed.text}`);
    await member.req("POST", "/api/auth/login", { username: "qa_member", password: "QaPass12345", remember: false }); // logged out in the section above
    const memberSeed = await member.req("POST", "/api/dev/seed", { fixture: "reset-rate-limit" });
    check("POST /api/dev/seed as member → 403 FORBIDDEN", memberSeed.status === 403 && memberSeed.json?.code === "FORBIDDEN", `${memberSeed.status} ${memberSeed.text}`);
    await member.req("POST", "/api/auth/logout");
  }

  // cleanup
  await seed({ fixture: "delete-user", username: "qa_member" });
  await seed({ fixture: "delete-user", username: "qa_member2" });
  await seed({ fixture: "delete-user", username: "qa_disabled" });
  await seed({ fixture: "reset-rate-limit" });
  await admin.req("DELETE", "/api/me/sessions?others=1");
  await admin.req("POST", "/api/auth/logout");
  await seeder.req("POST", "/api/auth/logout");

  console.log(results.join("\n"));
  console.log(`\n${results.filter((r) => r.startsWith("PASS")).length} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
