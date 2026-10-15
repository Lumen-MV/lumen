// Phase 3 extra API checks (moved from the tester's qa/tester script + fix-round-1 assertions). Dev server with LUMEN_SCENARIOS=1.
// Real TorBox calls here: ≤ 1 checkcached batch for a new title (Oppenheimer) + ≤ 1 checkcached for Spider-Man / Stranger Things
// if the 10-min memo expired; resolve reuses torrent_cache + the 50-min link memo (0 createtorrent, ≤ 1 requestdl). No downloads.
//   node tests/qa-api-contract-phase3-extra.mjs [--base http://localhost:3000]
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { adminCreds, makeReporter, readEnv } from "./qa-shared-helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const ENV = readEnv(ROOT);
const ADMIN = adminCreds(ENV);
const report = makeReporter();
const { check, note } = report;
const SPIDERMAN = "movie:634649";
const NEW_MOVIE = 872585; // Oppenheimer — usually not in title_sources at the start of a run
const db = new Database(path.join(ROOT, ENV.DATA_DIR ?? "data", "lumen.sqlite"), { readonly: true });

function client() {
  const jar = new Map();
  async function req(method, p, body) {
    const headers = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (jar.size) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
      if (/max-age=0/i.test(sc)) jar.delete(k); else jar.set(k, v);
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
    return { status: res.status, json, text };
  }
  return { get: (p) => req("GET", p), post: (p, b) => req("POST", p, b), del: (p) => req("DELETE", p), patch: (p, b) => req("PATCH", p, b) };
}
const noSecrets = (text) => !text.includes(ENV.TORBOX_API_KEY) && !/tb-cdn\.pw|token=|https?:\/\//.test(text);
const sortedDesc = (rel) => rel.every((r, i) => i === 0 || r.score <= rel[i - 1].score);
const titleRow = (id) => db.prepare("select * from title_sources where media_type='movie' and tmdb_id=? and season=0").get(id);

async function main() {
  const admin = client();
  check("admin login", (await admin.post("/api/auth/login", { username: ADMIN.u, password: ADMIN.p, remember: false })).status === 200);
  await admin.post("/api/dev/scenario", { flags: [] });
  await admin.post("/api/dev/seed", { fixture: "clear-cloud-jobs" });
  await admin.patch("/api/me/settings", { show_4k: false, quality: "1080p", prefer_small: false });

  // ---- ranking rules on real data
  const s = (await admin.get(`/api/sources?mediaKey=${SPIDERMAN}`)).json;
  const rel = s.releases;
  check("≤ 30 rows", rel.length <= 30, `n=${rel.length}`);
  check("rows sorted by score desc", sortedDesc(rel));
  check("exactly one recommended row = releases[0] = best, cached + direct", rel.filter((r) => r.recommended).length === 1 && rel[0].recommended && s.best.hash === rel[0].hash && rel[0].cacheState === "cached" && rel[0].playClass === "direct", `${rel[0].qualityLabel} ${rel[0].playClass} ${rel[0].parsed.group}`);
  check("no 2160p when show_4k off", rel.every((r) => r.parsed.resolution !== "2160p"));
  check("no CAM/TS rows", rel.every((r) => !r.parsed.bad));
  check("cached rows carry fileName from TorBox list", rel.filter((r) => r.cacheState === "cached").every((r) => typeof r.fileName === "string" && r.fileName.length > 0));
  check("direct rows are mp4/m4v files", rel.filter((r) => r.playClass === "direct").every((r) => /\.(mp4|m4v)$/i.test(r.fileName ?? "") || r.parsed.container === "mp4"));
  check("app rows have a playReason", rel.filter((r) => r.playClass === "app").every((r) => r.playReason.length > 0));
  const n1080 = rel.filter((r) => r.parsed.resolution === "1080p").length;
  // 4K semantics (fix round 1): show4k only SHOWS 2160p rows; order + best stay score-based; the cap reserves pref-res rows
  const s4k = (await admin.get(`/api/sources?mediaKey=${SPIDERMAN}&show4k=1`)).json;
  const n4k = s4k.releases.filter((r) => r.parsed.resolution === "2160p").length;
  note(`show4k=1: ${n4k} 2160p rows of ${s4k.releases.length}; best = ${s4k.best?.qualityLabel} ${s4k.best?.cacheState} ${s4k.best?.playClass}`);
  check("show4k=1: 2160p rows are shown", n4k > 0);
  check("show4k=1: best is the same cached direct row as with 4K off (hero never flips to 'Tải lên cloud')", s4k.best?.hash === s.best?.hash && s4k.best?.cacheState === "cached" && s4k.releases[0]?.hash === s4k.best?.hash);
  check("show4k=1: list stays ranked by score and ≤ 30 rows", s4k.releases.length <= 30 && sortedDesc(s4k.releases));
  check(`show4k=1: ≥ min(8, ${n1080}) 1080p rows survive the cap`, s4k.releases.filter((r) => r.parsed.resolution === "1080p").length >= Math.min(8, n1080));
  // memo: repeat calls fast (Torrentio 1 h + checkcached 10 min)
  const times = [];
  for (let i = 0; i < 3; i++) { const t = Date.now(); await admin.get(`/api/sources?mediaKey=${SPIDERMAN}`); times.push(Date.now() - t); }
  check("memo: 3 repeat calls each < 400 ms (no Torrentio / TorBox round trip)", times.every((t) => t < 400), times.join(","));

  // ---- episode picker scope + packs
  const e1 = (await admin.get("/api/sources?mediaKey=tv:66732:4:1")).json;
  const e2 = (await admin.get("/api/sources?mediaKey=tv:66732:4:2")).json;
  const packs1 = e1.releases.filter((r) => r.pack);
  const epRe = (e) => new RegExp(`(?:S0?4[ ._-]?E0?${e}|S0?4x0?${e}|\\b0?4x0?${e})(?!\\d)`, "i");
  check("S4E1: pack rows carry season 4 + 9 episodes", packs1.length > 0 && packs1.every((r) => r.pack.season === 4 && r.pack.episodes === 9), `packs=${packs1.length}/${e1.releases.length}`);
  check("S4E1: cached pack rows name the S04E01 file (S04E01 / S04x01 / 4x01), never another episode", packs1.filter((r) => r.cacheState === "cached").every((r) => epRe(1).test(r.fileName ?? "") || !/S0?4(?:E|x)0?\d+/i.test(r.fileName ?? "")), packs1.filter((r) => r.cacheState === "cached").map((r) => r.fileName).slice(0, 3).join(" | "));
  check("S4E2: same cached packs → the S04E02 file (episode-scoped)", e2.releases.filter((r) => r.pack && r.cacheState === "cached").every((r) => epRe(2).test(r.fileName ?? "") || !/S0?4(?:E|x)0?\d+/i.test(r.fileName ?? "")));
  check("pack rows show the whole-pack size or a '(1 tập)' per-file label", packs1.every((r) => r.pack.sizeIsFile === true || r.sizeBytes > 0));
  note(`pack sizes: ${packs1.slice(0, 3).map((r) => `${r.sizeLabel}${r.pack.sizeIsFile ? " (1 tập)" : ""}`).join(" | ")}`);
  const season = (await admin.get("/api/sources/season?key=tv:66732&s=4")).json;
  check("season chips: E1 known", season.episodes?.[1]?.cacheState !== undefined, Object.keys(season.episodes ?? {}).join(","));

  // ---- title_sources write (detail open) → read (browse cached=1); release_count stable across max=30 / max=500 callers
  const before = titleRow(NEW_MOVIE);
  const nm = await admin.get(`/api/sources?mediaKey=movie:${NEW_MOVIE}`);
  const after = titleRow(NEW_MOVIE);
  check(`GET /api/sources movie:${NEW_MOVIE} → 200 + title_sources row written${before ? " (row pre-existed)" : ""}`, nm.status === 200 && Boolean(after), `${nm.status} n=${nm.json?.releases?.length}`);
  check("row.release_count ≥ rows returned (count after dedupe, before the cap)", after && after.release_count >= nm.json.releases.length, `release_count=${after?.release_count} rows=${nm.json?.releases?.length}`);
  const rc1 = titleRow(634649)?.release_count;
  await admin.post("/api/cloud/jobs", { mediaKey: SPIDERMAN, hash: "f".repeat(40) }); // 404 path → getSources(max 500) → persist
  const rc2 = titleRow(634649)?.release_count;
  check("release_count does not flap between the picker (30) and hash-lookup (500) callers", rc1 === rc2, `${rc1} → ${rc2}`);
  const cachedOnly = (await admin.get("/api/catalog/discover?type=movie&cached=1&year=all")).json;
  check("browse cached=1 rows all cached + count", cachedOnly.items.every((c) => c.cacheState === "cached") && typeof cachedOnly.totalResults === "number");
  const tPage2 = Date.now();
  await admin.get("/api/catalog/discover?type=movie&cached=1&year=all&page=2");
  check("browse cached=1 page 2 served from the 10-min list memo (< 1 s)", Date.now() - tPage2 < 1000, `${Date.now() - tPage2}ms`);
  await admin.post("/api/dev/scenario", { flags: ["all-uncached"] });
  await admin.get(`/api/sources?mediaKey=${SPIDERMAN}`);
  await admin.post("/api/dev/scenario", { flags: [] });
  check("all-uncached answer not persisted to title_sources", titleRow(634649)?.cached_count > 0);

  // ---- app queue beyond MAX_CLOUD_JOBS (dev sim, frozen progress; no real TorBox)
  const hashes = rel.map((r) => r.hash);
  await admin.post("/api/dev/scenario", { flags: ["all-uncached", "cloud-sim=downloading:10:0"] });
  const jobs = [];
  for (let i = 0; i < 7; i++) jobs.push((await admin.post("/api/cloud/jobs", { mediaKey: SPIDERMAN, hash: hashes[i] })).json);
  check("jobs 1–6 start downloading", jobs.slice(0, 6).every((j) => j?.state === "downloading"), jobs.slice(0, 6).map((j) => j?.state).join(","));
  check("job 7 app-queued: 'Xếp hàng · 6/6 slot'", jobs[6]?.state === "queued" && jobs[6].queuedSlots?.active === 6 && jobs[6].queuedSlots?.limit === 6, JSON.stringify(jobs[6]?.queuedSlots));
  check("cancel job 1 → 204", (await admin.del(`/api/cloud/jobs/${jobs[0].id}`)).status === 204);
  const after7 = (await admin.get(`/api/cloud/jobs?mediaKey=${SPIDERMAN}`)).json.jobs.find((j) => j.id === jobs[6].id);
  check("after cancel: job 7 promoted to downloading", after7?.state === "downloading", JSON.stringify(after7));
  await admin.post("/api/dev/seed", { fixture: "clear-cloud-jobs" }); // free slots → the real startJob path runs (the client throws on the scenario cookie before any network)
  await admin.post("/api/dev/scenario", { flags: ["all-uncached", "torbox-down"] });
  const jd = await admin.post("/api/cloud/jobs", { mediaKey: SPIDERMAN, hash: hashes[8] });
  check("create job while torbox-down → 201 error 'Không kết nối được Torbox' (network label, not 'ít seed')", jd.status === 201 && jd.json?.state === "error" && /Không kết nối được Torbox/.test(jd.json.errorMsg ?? ""), `${jd.status} ${jd.json?.state} ${jd.json?.errorMsg}`);
  await admin.post("/api/dev/scenario", { flags: [] });
  check("cached hash without sim → 409 ALREADY_CACHED", (await admin.post("/api/cloud/jobs", { mediaKey: SPIDERMAN, hash: hashes[0] })).status === 409);
  // cancel semantics: a READY job → 204, row gone (sim torrent; the real path never deletes a ready torrent)
  const seeded = await admin.post("/api/dev/seed", { fixture: "cloud-jobs", mediaKey: SPIDERMAN, title: "Người Nhện", jobs: [{ hash: hashes[9], state: "ready" }] });
  const readyId = seeded.json?.ids?.[0];
  check("cancel a ready job → 204 and the row is gone", (await admin.del(`/api/cloud/jobs/${readyId}`)).status === 204 && !(await admin.get(`/api/cloud/jobs?mediaKey=${SPIDERMAN}`)).json.jobs.some((j) => j.id === readyId));
  await admin.post("/api/dev/seed", { fixture: "clear-cloud-jobs" });

  // ---- error bodies never echo upstream text; resolve contract; fileId validation
  await admin.post("/api/dev/scenario", { flags: ["torbox-down"] });
  const downRes = await admin.post("/api/play/resolve", { mediaKey: SPIDERMAN, hash: hashes[hashes.length - 1] });
  check("torbox-down resolve → 503 body = {code} only (no upstream detail)", [502, 503].includes(downRes.status) && JSON.stringify(Object.keys(downRes.json ?? {})) === JSON.stringify(["code"]) && noSecrets(downRes.text), `${downRes.status} ${downRes.text.slice(0, 80)}`);
  await admin.post("/api/dev/scenario", { flags: [] });
  if (process.env.QA_SKIP_REAL === "1") report.note("QA_SKIP_REAL=1: real resolve / stream-probe / link-ready outage checks skipped (5 checks)");
  else {
    const r1 = await admin.post("/api/play/resolve", { mediaKey: SPIDERMAN, hash: s.best.hash });
    check("resolve by hash → exactly {streamId, playClass, fileName}, no secrets", r1.status === 200 && JSON.stringify(Object.keys(r1.json).sort()) === JSON.stringify(["fileName", "playClass", "streamId"]) && noSecrets(r1.text), `${r1.status}`);
    check("resolve fileId not in torrent → 404 NO_VIDEO_FILE", (await admin.post("/api/play/resolve", { mediaKey: SPIDERMAN, hash: s.best.hash, fileId: 987654 })).json?.code === "NO_VIDEO_FILE");
    const probe = await admin.get(`/api/dev/stream-probe?streamId=${r1.json.streamId}`);
    check("dev stream-probe answers status + bytes only (no host / URL part)", probe.status === 200 && probe.json.host === undefined && noSecrets(probe.text), JSON.stringify(probe.json));
    // torbox-down with a primed link: the best row stays playable (linkReady) while others are dimmed
    await admin.post("/api/dev/scenario", { flags: ["torbox-down"] });
    const downList = (await admin.get(`/api/sources?mediaKey=${SPIDERMAN}`)).json;
    check("torbox-down after a resolve: best row carries linkReady, uncached rows do not", downList.state === "torbox-down" && downList.releases.find((r) => r.hash === s.best.hash)?.linkReady === true && downList.releases.filter((r) => r.cacheState === "uncached").every((r) => !r.linkReady));
    const downResolve = await admin.post("/api/play/resolve", { mediaKey: SPIDERMAN, hash: s.best.hash });
    check("torbox-down: resolving the link-ready row still succeeds (torrent_cache + 50-min link memo, 0 TorBox calls)", downResolve.status === 200 && /^[0-9a-f]{32}$/.test(downResolve.json?.streamId ?? ""), `${downResolve.status}`);
    await admin.post("/api/dev/scenario", { flags: [] });
  }

  // ---- request throttle + health counters
  const reqA = await admin.post("/api/sources/request", { mediaKey: `movie:${NEW_MOVIE}` });
  const reqB = await admin.post("/api/sources/request", { mediaKey: `movie:${NEW_MOVIE}` });
  check("request: first → 200, second within a minute → 429 RATE_LIMITED", reqA.status === 200 && reqB.status === 429 && reqB.json?.code === "RATE_LIMITED", `${reqA.status}/${reqB.status}`);
  const act = db.prepare("select kind,text from activity_log where kind='admin' order by id desc limit 1").get();
  check("request writes one activity_log admin row naming the title", /Oppenheimer/i.test(act?.text ?? ""), JSON.stringify(act));
  const health = (await admin.get("/api/health")).json;
  check("health exposes torbox counters (counts only)", typeof health?.torbox?.calls === "number" && typeof health.torbox.errors === "number" && typeof health.torbox.retries === "number" && Object.keys(health.torbox).every((k) => ["calls", "retries", "errors", "lastRemaining"].includes(k)), JSON.stringify(health?.torbox));
  note(`torbox calls so far this process: ${health?.torbox?.calls}`);
  report.finish();
}
main().catch((err) => { console.error(err); process.exit(1); });
