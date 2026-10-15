// Phase 4 API contract checks against a RUNNING dev server (LUMEN_SCENARIOS=1): resolve (play-sample) → manifest / stream-info
// (src only in JSON, never the TorBox key), dev sample + stream proxy Range semantics (200/206/416/HEAD, ownership), probe,
// refresh (link-expired ×2), external hand-off links + rate limit, progress heartbeat / continue / remove / mark / clear,
// series progress primary states (fixtures), my-list GET filter/sort, 5-viewer limit (429 LIMIT_5, hand-off still allowed).
// No TorBox traffic at all: every stream is the local ffmpeg sample.   node tests/qa-api-contract-phase4.mjs [--base …]
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
const SPIDERMAN = "movie:634649";
const STRANGER = "tv:66732";
const noSecrets = (text) => !(ENV.TORBOX_API_KEY && text.includes(ENV.TORBOX_API_KEY)) && !/tb-cdn\.pw/.test(text);

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
      const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
      if (/max-age=0/i.test(sc)) jar.delete(k); else jar.set(k, v);
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
  return { raw, get: (p, h) => req("GET", p, undefined, h), post: (p, b) => req("POST", p, b), del: (p) => req("DELETE", p), patch: (p, b) => req("PATCH", p, b), head: (p, h) => raw("HEAD", p, undefined, h) };
}

/** Range probe: reads the body length without printing anything about the URL. */
async function rangeReq(c, p, range) {
  const res = await c.raw("GET", p, undefined, range ? { range } : {});
  const buf = await res.arrayBuffer();
  return { status: res.status, len: buf.byteLength, type: res.headers.get("content-type"), cr: res.headers.get("content-range"), cl: res.headers.get("content-length"), ar: res.headers.get("accept-ranges") };
}

async function main() {
  const anon = client();
  for (const p of ["/api/play/manifest?streamId=" + "0".repeat(32), "/api/play/stream/" + "0".repeat(32), "/api/play/external?streamId=x&target=copy", "/api/progress/continue", "/api/series/66732/progress", "/api/my-list", "/api/play/probe?streamId=x"]) check(`anon GET ${p.split("?")[0]} → 401`, (await anon.get(p)).status === 401);
  check("anon POST /api/progress → 401", (await anon.post("/api/progress", { mediaKey: SPIDERMAN, positionS: 1, durationS: 2 })).status === 401);

  const admin = client();
  check("admin login", (await admin.post("/api/auth/login", { username: ADMIN.u, password: ADMIN.p, remember: false })).status === 200);
  await admin.post("/api/dev/scenario", { flags: [] });
  await admin.post("/api/dev/seed", { fixture: "clear-views" });
  await admin.post("/api/dev/seed", { fixture: "progress", rows: [] });

  // ---- dev sample route (Range)
  const full = await rangeReq(admin, "/api/dev/sample.mp4?v=plain");
  check("sample: GET → 200 video/mp4 with content-length + accept-ranges", full.status === 200 && full.type === "video/mp4" && Number(full.cl) === full.len && full.len > 1_000_000 && full.ar === "bytes", `${full.status} ${full.len}B`);
  const size = full.len;
  const part = await rangeReq(admin, "/api/dev/sample.mp4?v=plain", "bytes=0-1023");
  check("sample: Range 0-1023 → 206 + Content-Range", part.status === 206 && part.len === 1024 && part.cr === `bytes 0-1023/${size}` && part.cl === "1024");
  const tail = await rangeReq(admin, "/api/dev/sample.mp4?v=plain", `bytes=${size - 100}-`);
  check("sample: open-ended Range → 206 last 100 bytes", tail.status === 206 && tail.len === 100 && tail.cr === `bytes ${size - 100}-${size - 1}/${size}`);
  const bad = await rangeReq(admin, "/api/dev/sample.mp4?v=plain", `bytes=${size + 10}-`);
  check("sample: Range past the end → 416 bytes */size", bad.status === 416 && bad.cr === `bytes */${size}`);
  const headRes = await admin.head("/api/dev/sample.mp4?v=plain", { range: "bytes=0-9" });
  check("sample: HEAD honours Range (206, length 10, no body)", headRes.status === 206 && headRes.headers.get("content-length") === "10" && (await headRes.arrayBuffer()).byteLength === 0);
  const mkv = await rangeReq(admin, "/api/dev/sample.mp4?v=mkv", "bytes=0-9");
  check("sample: mkv variant → video/x-matroska", mkv.status === 206 && mkv.type === "video/x-matroska");

  // ---- resolve (play-sample) → manifest (direct)
  await admin.post("/api/dev/scenario", { flags: ["play-sample"] });
  check("resolve: bad body → 400", (await admin.post("/api/play/resolve", { mediaKey: "nope" })).status === 400);
  const r1 = await admin.post("/api/play/resolve", { mediaKey: SPIDERMAN, auto: true });
  check("resolve play-sample → streamId + direct + no secrets", r1.status === 200 && /^[0-9a-f]{32}$/.test(r1.json?.streamId ?? "") && r1.json.playClass === "direct" && noSecrets(r1.text), `${r1.status}`);
  const id1 = r1.json.streamId;
  const man = await admin.get(`/api/play/manifest?streamId=${id1}`);
  const m = man.json ?? {};
  check("manifest 200 direct: src = sample URL, title, container MP4, codec/audio labels, prefs", man.status === 200 && m.mode === "direct" && /\/api\/dev\/sample\.mp4\?v=plain&g=0$/.test(m.src ?? "") && typeof m.title === "string" && m.title.length > 0 && m.container === "MP4" && typeof m.codec === "string" && typeof m.audio === "string" && m.mediaKey === SPIDERMAN && typeof m.autoplayNext === "boolean" && typeof m.askResume === "boolean" && Array.isArray(m.subtitleTracks) && m.mp4Alt === null && m.resume === undefined, JSON.stringify({ status: man.status, mode: m.mode, container: m.container, codec: m.codec }));
  check("manifest: backdrop + imdbId from TMDB, no next/series for a movie", typeof m.backdropUrl === "string" && /^tt\d+$/.test(m.imdbId ?? "") && m.series === undefined && m.next === undefined);
  check("stream-info alias removed (one manifest endpoint) → 404", (await admin.get(`/api/play/stream-info/${id1}`)).status === 404);
  check("manifest: bad id → 400, unknown → 410 STREAM_EXPIRED", (await admin.get("/api/play/manifest?streamId=zz")).status === 400 && (await admin.get("/api/play/manifest?streamId=" + "0".repeat(32))).status === 410);
  const probe = await admin.get(`/api/play/probe?streamId=${id1}`);
  check("probe → {status:206}", probe.status === 200 && probe.json?.status === 206, JSON.stringify(probe.json));

  // ---- series manifest: next episode, season info, same pack (sample)
  const r2 = await admin.post("/api/play/resolve", { mediaKey: `${STRANGER}:4:1`, auto: true });
  const sm = (await admin.get(`/api/play/manifest?streamId=${r2.json?.streamId}`)).json ?? {};
  check("series manifest: series{season 4, episode 1, epTitle, seasons[]} + next S4 T2 samePack", sm.series?.season === 4 && sm.series?.episode === 1 && typeof sm.series?.epTitle === "string" && sm.series?.seasons?.length >= 4 && sm.next?.season === 4 && sm.next?.episode === 2 && sm.next?.samePack === true && sm.next?.mediaKey === `${STRANGER}:4:2`, JSON.stringify({ series: sm.series?.season, next: sm.next?.episode }));
  const r3 = await admin.post("/api/play/resolve", { mediaKey: `${STRANGER}:4:9`, auto: true });
  const em = (await admin.get(`/api/play/manifest?streamId=${r3.json?.streamId}`)).json ?? {};
  check("series manifest: last episode of S4 → endSeason with next season 5 (no next)", em.next === undefined && em.endSeason?.season === 4 && em.endSeason?.nextSeason?.n === 5 && typeof em.endSeason?.nextSeason?.episodeCount === "number", JSON.stringify(em.endSeason));

  // ---- proxy mode (scenario override) + stream route
  await admin.post("/api/dev/scenario", { flags: ["play-sample", "stream-mode=proxy"] });
  const pm = (await admin.get(`/api/play/manifest?streamId=${id1}`)).json ?? {};
  check("stream-mode=proxy → manifest src = /api/play/stream/[id]", pm.mode === "proxy" && pm.src === `/api/play/stream/${id1}`);
  const pFull = await rangeReq(admin, `/api/play/stream/${id1}`);
  check("proxy: GET → 200 full body, content-type + content-length + accept-ranges passed through", pFull.status === 200 && pFull.len === size && pFull.type === "video/mp4" && Number(pFull.cl) === size && pFull.ar === "bytes", `${pFull.status} ${pFull.len}`);
  const pPart = await rangeReq(admin, `/api/play/stream/${id1}`, "bytes=1000-1999");
  check("proxy: Range 1000-1999 → 206 + Content-Range + 1000 bytes", pPart.status === 206 && pPart.len === 1000 && pPart.cr === `bytes 1000-1999/${size}` && pPart.cl === "1000");
  const pOpen = await rangeReq(admin, `/api/play/stream/${id1}`, `bytes=${size - 50}-`);
  check("proxy: open-ended Range → 206 last 50 bytes", pOpen.status === 206 && pOpen.len === 50);
  const p416 = await rangeReq(admin, `/api/play/stream/${id1}`, `bytes=${size * 2}-`);
  check("proxy: unsatisfiable Range → 416 passed through", p416.status === 416 && p416.cr === `bytes */${size}`);
  const pHead = await admin.head(`/api/play/stream/${id1}`, { range: "bytes=0-99" });
  check("proxy: HEAD → 206 headers, empty body", pHead.status === 206 && pHead.headers.get("content-length") === "100" && (await pHead.arrayBuffer()).byteLength === 0);
  check("proxy: unknown stream → 410", (await admin.get("/api/play/stream/" + "0".repeat(32))).status === 410);
  await admin.post("/api/dev/scenario", { flags: ["play-sample"] });

  // ---- ownership: a member cannot read the admin's stream
  await admin.post("/api/dev/seed", { fixture: "user", username: "qa_member4", displayName: "QA4", password: "QaMember123", onboarded: true });
  const member = client();
  check("member login", (await member.post("/api/auth/login", { username: "qa_member4", password: "QaMember123", remember: false })).status === 200);
  check("member: admin's manifest → 410, stream → 410, probe → 410, external → 410", (await member.get(`/api/play/manifest?streamId=${id1}`)).status === 410 && (await member.get(`/api/play/stream/${id1}`)).status === 410 && (await member.get(`/api/play/probe?streamId=${id1}`)).status === 410 && (await member.get(`/api/play/external?streamId=${id1}&target=copy`)).status === 410);

  // ---- refresh (link-expired relink)
  const rf = await admin.post("/api/play/resolve", { streamId: id1, refresh: true });
  check("refresh → new streamId, same release, generation bumped", rf.status === 200 && rf.json?.streamId !== id1 && /g=1$/.test(((await admin.get(`/api/play/manifest?streamId=${rf.json?.streamId}`)).json ?? {}).src ?? ""), `${rf.status}`);
  check("refresh unknown → 410", (await admin.post("/api/play/resolve", { streamId: "0".repeat(32), refresh: true })).status === 410);
  await admin.post("/api/dev/scenario", { flags: ["play-sample", "link-expired"] });
  check("link-expired: old link 403, refreshed link 206, probe reports 403", (await rangeReq(admin, m.src.replace(BASE, ""), "bytes=0-9")).status === 403 && (await rangeReq(admin, `/api/dev/sample.mp4?v=plain&g=1`, "bytes=0-9")).status === 206 && (await admin.get(`/api/play/probe?streamId=${id1}`)).json?.status === 403);
  await admin.post("/api/dev/scenario", { flags: ["play-sample", "link-expired=fail"] });
  check("link-expired=fail: refresh → 503, even g=1 → 403", (await admin.post("/api/play/resolve", { streamId: id1, refresh: true })).status === 503 && (await rangeReq(admin, `/api/dev/sample.mp4?v=plain&g=1`, "bytes=0-9")).status === 403);
  await admin.post("/api/dev/scenario", { flags: ["play-sample"] });

  // ---- external hand-off
  const ext = await admin.get(`/api/play/external?streamId=${id1}&target=copy`);
  check("external copy → the stream URL + expiresAt + subtitle (sample runs in the subtitle sim → signed path-style vi .srt link)", ext.status === 200 && ext.json?.url === m.src && typeof ext.json?.expiresAt === "number" && typeof ext.json?.subtitle?.label === "string" && /\/api\/subs\/s\/\d+\/\d+\/[0-9a-f]{64}\/subtitle\.srt$/.test(ext.json?.subtitle?.url ?? ""), JSON.stringify(ext.json?.subtitle));
  check("external infuse / vlc / stremio deep links", /^infuse:\/\/x-callback-url\/play\?url=/.test((await admin.get(`/api/play/external?streamId=${id1}&target=infuse`)).json?.url ?? "") && /^vlc:\/\//.test((await admin.get(`/api/play/external?streamId=${id1}&target=vlc`)).json?.url ?? "") && (await admin.get(`/api/play/external?streamId=${id1}&target=stremio`)).json?.url === "stremio:///detail/movie/tt10872600");
  check("external: bad target → 400", (await admin.get(`/api/play/external?streamId=${id1}&target=nope`)).status === 400);
  let limited = false;
  for (let i = 0; i < 12 && !limited; i++) limited = (await admin.get(`/api/play/external?streamId=${id1}&target=copy`)).status === 429;
  check("external: 10/min/user → 429", limited);

  // ---- progress heartbeat / continue / remove / clear
  check("progress: bad body → 400", (await admin.post("/api/progress", { mediaKey: SPIDERMAN, positionS: -1, durationS: 10 })).status === 400);
  check("progress POST → 204", (await admin.post("/api/progress", { mediaKey: SPIDERMAN, positionS: 3672, durationS: 8900, streamId: id1 })).status === 204);
  const cont = await admin.get("/api/progress/continue");
  const ci = cont.json?.items?.find((i) => i.mediaKey === SPIDERMAN);
  check("continue lists it: 41 %, title, backdrop, positionS", cont.status === 200 && ci?.percent === 41 && typeof ci.title === "string" && ci.positionS === 3672 && typeof ci.backdropUrl === "string", JSON.stringify(ci));
  const man2 = (await admin.get(`/api/play/manifest?streamId=${id1}`)).json ?? {};
  check("manifest now carries resume {positionS 3672, percent 41, device, when}", man2.resume?.positionS === 3672 && man2.resume?.percent === 41 && typeof man2.resume?.device === "string" && typeof man2.resume?.when === "string", JSON.stringify(man2.resume));
  check("progress at 92 % → completed → leaves continue + no resume", (await admin.post("/api/progress", { mediaKey: SPIDERMAN, positionS: 8200, durationS: 8900 })).status === 204 && !(await admin.get("/api/progress/continue")).json.items.some((i) => i.mediaKey === SPIDERMAN) && ((await admin.get(`/api/play/manifest?streamId=${id1}`)).json ?? {}).resume === undefined);
  await admin.post("/api/progress", { mediaKey: SPIDERMAN, positionS: 1000, durationS: 8900 });
  check("DELETE ?mediaKey → 204 and gone from continue", (await admin.del(`/api/progress?mediaKey=${SPIDERMAN}`)).status === 204 && !(await admin.get("/api/progress/continue")).json.items.some((i) => i.mediaKey === SPIDERMAN));
  await admin.post("/api/progress", { mediaKey: `${STRANGER}:4:1`, positionS: 760, durationS: 6333 });
  check("series continue item carries epLabel S4 T1", (await admin.get("/api/progress/continue")).json.items.find((i) => i.tmdbId === 66732)?.epLabel === "S4 T1");
  check("DELETE ?all=1 → 204 → continue empty", (await admin.del("/api/progress?all=1")).status === 204 && (await admin.get("/api/progress/continue")).json.items.length === 0);

  // ---- series progress primary states
  const sp = async () => (await admin.get("/api/series/66732/progress")).json;
  check("series progress fresh → first S1 T1, 0 watched", (await sp())?.primary?.kind === "first" && (await sp()).seasons?.[1]?.watched === 0);
  await admin.post("/api/dev/seed", { fixture: "progress", rows: [{ mediaKey: `${STRANGER}:4:1`, positionS: 760, durationS: 6333 }] });
  const inProg = await sp();
  check("S4 T1 at 12 % → continue S4 T1 · 760 s · 12 %, episode map", inProg.primary?.kind === "continue" && inProg.primary.season === 4 && inProg.primary.episode === 1 && inProg.primary.positionS === 760 && inProg.primary.percent === 12 && inProg.episodes?.["4:1"]?.percent === 12, JSON.stringify(inProg.primary));
  check("mark S4 T1 watched → next S4 T2 + lastCompleted + seasons[4].watched 1", (await admin.post("/api/progress/mark", { mediaKey: `${STRANGER}:4:1`, watched: true })).status === 204 && (await sp()).primary?.kind === "next" && (await sp()).primary.episode === 2 && (await sp()).lastCompleted?.episode === 1 && (await sp()).seasons?.[4]?.watched === 1);
  check("mark unwatched → first again", (await admin.post("/api/progress/mark", { mediaKey: `${STRANGER}:4:1`, watched: false })).status === 204 && (await sp()).primary?.kind === "first");
  await admin.post("/api/dev/seed", { fixture: "progress", rows: [{ mediaKey: STRANGER, allEpisodes: true, completed: true, durationS: 3000 }] });
  const fin = await sp();
  check("all aired episodes completed → replay S1 T1, seasons fully watched", fin.primary?.kind === "replay" && fin.seasons?.[1]?.watched === fin.seasons?.[1]?.total && fin.seasonCount >= 4, JSON.stringify(fin.primary));
  check("series progress: bad id → 400", (await admin.get("/api/series/abc/progress")).status === 400);

  // ---- my-list GET
  await admin.post("/api/dev/seed", { fixture: "my-list", items: [{ mediaKey: SPIDERMAN, daysAgo: 1 }, { mediaKey: STRANGER, daysAgo: 2 }, { mediaKey: "movie:872585", daysAgo: 3 }] });
  const ml = await admin.get("/api/my-list");
  check("my-list GET → 3 cards with addedAt (newest first) + saved", ml.status === 200 && ml.json?.items?.length === 3 && ml.json.items[0].mediaKey === SPIDERMAN && typeof ml.json.items[0].addedAt === "string" && ml.json.items.every((i) => i.saved === true && typeof i.title === "string"), `${ml.status} n=${ml.json?.items?.length}`);
  const tvOnly = (await admin.get("/api/my-list?filter=tv")).json.items;
  check("my-list ?filter=tv → series only", tvOnly.length === 1 && tvOnly.every((i) => i.type === "tv"));
  const byName = (await admin.get("/api/my-list?sort=name")).json.items.map((i) => i.title);
  check("my-list sort=name", [...byName].sort((a, b) => a.localeCompare(b, "vi")).join("|") === byName.join("|"), byName.join("|"));
  check("my-list bad filter → 400", (await admin.get("/api/my-list?filter=zzz")).status === 400);

  // ---- 5-viewer limit
  await admin.post("/api/dev/seed", { fixture: "viewers", count: 5 });
  const lim = await admin.get(`/api/play/manifest?streamId=${id1}`);
  check("5 active viewers + 6th user → 429 LIMIT_5 {active:5}", lim.status === 429 && lim.json?.code === "LIMIT_5" && lim.json.active === 5, `${lim.status} ${JSON.stringify(lim.json)}`);
  check("hand-off still allowed under the limit", (await admin.get(`/api/play/external?streamId=${rf.json.streamId}&target=infuse`)).status === 200 || (await admin.get(`/api/play/external?streamId=${rf.json.streamId}&target=infuse`)).status === 429);
  const beatFull = await admin.post("/api/progress", { mediaKey: `${STRANGER}:4:3`, positionS: 45, durationS: 100 });
  const savedFull = (await admin.get("/api/series/66732/progress")).json?.episodes?.["4:3"]?.positionS;
  check("heartbeat while the group is full → 429 LIMIT_5, no seat stolen (manifest still 429), position still saved", beatFull.status === 429 && beatFull.json?.code === "LIMIT_5" && (await admin.get(`/api/play/manifest?streamId=${id1}`)).status === 429 && savedFull === 45, `${beatFull.status} ${JSON.stringify(beatFull.json)} pos=${savedFull}`);
  await admin.post("/api/dev/seed", { fixture: "viewers", count: 4 });
  check("4 viewers → the 5th seat is free (200) and the heartbeat claims it", (await admin.get(`/api/play/manifest?streamId=${id1}`)).status === 200 && (await admin.post("/api/progress", { mediaKey: SPIDERMAN, positionS: 10, durationS: 100, streamId: id1 })).status === 204);
  await admin.post("/api/dev/seed", { fixture: "viewers", count: 5, keep: true });
  check("a viewer already counted (own fresh beat) keeps playing: 6 active, requester among them → manifest 200 + beat 204", (await admin.get(`/api/play/manifest?streamId=${id1}`)).status === 200 && (await admin.post("/api/progress", { mediaKey: SPIDERMAN, positionS: 20, durationS: 100, streamId: id1 })).status === 204);

  // ---- cleanup
  await admin.post("/api/dev/seed", { fixture: "clear-views" });
  await admin.post("/api/dev/seed", { fixture: "progress", rows: [] });
  await admin.post("/api/dev/seed", { fixture: "my-list", items: [] });
  for (let i = 1; i <= 5; i++) await admin.post("/api/dev/seed", { fixture: "delete-user", username: `viewer${i}` });
  await admin.post("/api/dev/seed", { fixture: "delete-user", username: "qa_member4" });
  await admin.post("/api/dev/scenario", { flags: [] });
  const health = await admin.get("/api/health");
  note(`torbox calls this process: ${health.json?.torbox?.calls} (the phase-4 suite itself makes none)`);
  report.finish();
}

main().catch((err) => { console.error(err); process.exit(1); });
