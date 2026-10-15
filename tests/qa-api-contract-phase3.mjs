// Phase 3 API contract checks against a RUNNING dev server (LUMEN_SCENARIOS=1): /api/sources (real Torrentio + TorBox
// checkcached), cloud jobs CRUD through the dev fake TorBox (cookie cloud-sim — no real download ever), poller
// completion → ready + notification, resolve → streamId + a single ≤ 1 MB Range probe (server-side, 206), torbox-down /
// all-uncached scenarios, auth scoping, no TorBox key / CDN URL in any client-visible payload.
//   node tests/qa-api-contract-phase3.mjs [--base http://localhost:3000]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adminCreds, makeReporter, readEnv, sleep } from "./qa-shared-helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const ENV = readEnv(ROOT);
const ADMIN = adminCreds(ENV);
const report = makeReporter();
const { check, note } = report;
const SPIDERMAN = "movie:634649";
const STRANGER = "tv:66732:4:1";

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

const isRelease = (r) => r && /^[0-9a-f]{40}$/.test(r.hash) && ["cached", "uncached"].includes(r.cacheState) && ["direct", "maybe", "app"].includes(r.playClass) && typeof r.qualityLabel === "string" && typeof r.sizeLabel === "string" && typeof r.score === "number" && r.parsed && typeof r.parsed.group === "string";
const noSecrets = (text) => !text.includes(ENV.TORBOX_API_KEY) && !/tb-cdn\.pw|token=/.test(text);

/** Real TorBox: one `requestdl` (+ the 50-min memo) and ONE ≤ 1 MB CDN Range probe — skipped with QA_SKIP_REAL=1. */
async function realResolveChecks(admin, s) {
  const t2 = Date.now();
  const resolved = await admin.post("/api/play/resolve", { mediaKey: SPIDERMAN, auto: true });
  const resolveMs = Date.now() - t2;
  check("resolve auto → streamId < 3 s", resolved.status === 200 && /^[0-9a-f]{32}$/.test(resolved.json?.streamId ?? "") && resolveMs < 3000, `${resolved.status} ${resolveMs}ms ${resolved.json?.playClass}`);
  check("resolve payload: fileName + playClass, no CDN URL / key", typeof resolved.json?.fileName === "string" && noSecrets(resolved.text));
  const probe = await admin.get(`/api/dev/stream-probe?streamId=${resolved.json?.streamId}`);
  check("CDN Range 0-1048575 → 206, ≤ 1 MB, no host in the answer", probe.status === 200 && probe.json?.status === 206 && /^(video\/|application\/octet-stream)/.test(probe.json.contentType ?? "") && probe.json.bytes <= 1_048_576 && probe.json.host === undefined && noSecrets(probe.text), JSON.stringify(probe.json));
  check("resolve auto prefers a direct (MP4) release", resolved.json?.playClass === "direct" && /\.(mp4|m4v)$/i.test(resolved.json?.fileName ?? ""), resolved.json?.fileName);
  const byHash = await admin.post("/api/play/resolve", { mediaKey: SPIDERMAN, hash: s.json.best.hash });
  check("resolve by hash → streamId (link cache)", byHash.status === 200 && byHash.json?.streamId !== resolved.json?.streamId);
  check("resolve unknown hash → 404", (await admin.post("/api/play/resolve", { mediaKey: SPIDERMAN, hash: "e".repeat(40) })).status === 404);
  const watch = await admin.get(`/watch/${resolved.json?.streamId}`);
  check("/watch/[streamId] placeholder renders (200) without the CDN URL", watch.status === 200 && noSecrets(watch.text) && watch.text.includes(resolved.json.streamId));
  // "Lần trước" steers the primary resolve (auto / pickReason:'primary'); an uncached pref falls back to the best row (≤ 1 extra requestdl)
  check("resolve answers the resolved hash", resolved.json?.hash === s.json.best.hash, resolved.json?.hash);
  const alt = s.json.releases.find((r) => r.cacheState === "cached" && r.hash !== s.json.best.hash && r.playClass !== "app");
  if (!alt) note("pref-steered resolve skipped: only one cached row");
  else {
    await admin.post("/api/sources/prefs", { mediaKey: SPIDERMAN, hash: alt.hash });
    const viaPref = await admin.post("/api/play/resolve", { mediaKey: SPIDERMAN, hash: s.json.best.hash, pickReason: "primary" });
    check("resolve pickReason:'primary' uses the remembered release", viaPref.status === 200 && viaPref.json?.hash === alt.hash, `${viaPref.status} ${viaPref.json?.hash}`);
    const viaRow = await admin.post("/api/play/resolve", { mediaKey: SPIDERMAN, hash: s.json.best.hash, pickReason: "row" });
    check("resolve pickReason:'row' keeps the given hash", viaRow.status === 200 && viaRow.json?.hash === s.json.best.hash);
    const uncached = s.json.releases.find((r) => r.cacheState === "uncached");
    if (uncached) {
      await admin.post("/api/sources/prefs", { mediaKey: SPIDERMAN, hash: uncached.hash });
      const fallback = await admin.post("/api/play/resolve", { mediaKey: SPIDERMAN, auto: true });
      check("resolve auto with an uncached pref falls back to the best cached row", fallback.status === 200 && fallback.json?.hash === s.json.best.hash, `${fallback.status} ${fallback.json?.hash}`);
    }
    await admin.del(`/api/sources/prefs?mediaKey=${SPIDERMAN}`);
  }
}

async function main() {
  const anon = client();
  for (const p of ["/api/sources?mediaKey=movie:1", "/api/cloud/jobs?mediaKey=movie:1", "/api/sources/season?key=tv:66732&s=1"]) check(`anon GET ${p} → 401`, (await anon.get(p)).status === 401);
  check("anon POST /api/cloud/jobs → 401", (await anon.post("/api/cloud/jobs", { mediaKey: "movie:1", hash: "a".repeat(40) })).status === 401);
  check("anon POST /api/play/resolve → 401", (await anon.post("/api/play/resolve", { mediaKey: "movie:1", auto: true })).status === 401);
  check("anon POST /api/sources/prefs → 401", (await anon.post("/api/sources/prefs", { mediaKey: "movie:1", hash: "a".repeat(40) })).status === 401);
  check("anon DELETE /api/sources/prefs → 401", (await anon.del("/api/sources/prefs?mediaKey=movie:1")).status === 401);

  const admin = client();
  check("admin login", (await admin.post("/api/auth/login", { username: ADMIN.u, password: ADMIN.p, remember: false })).status === 200);
  await admin.post("/api/dev/scenario", { flags: [] });
  await admin.post("/api/dev/seed", { fixture: "clear-cloud-jobs" });
  await admin.patch("/api/me/settings", { show_4k: false });

  // ---- sources (real)
  const t0 = Date.now();
  const s = await admin.get(`/api/sources?mediaKey=${SPIDERMAN}`);
  const ms = Date.now() - t0;
  check("sources Spider-Man 200 + ≥ 8 releases", s.status === 200 && s.json?.releases?.length >= 8, `${s.status} n=${s.json?.releases?.length} ${ms}ms`);
  check("sources shape", s.json?.releases?.every(isRelease) && s.json.state === "ok" && typeof s.json.slots?.limit === "number");
  check("sources has cached rows + best is cached", s.json?.releases?.some((r) => r.cacheState === "cached") && s.json?.best?.cacheState === "cached", s.json?.best?.playClass);
  check("sources: 2160p hidden by default", s.json?.releases?.every((r) => r.parsed.resolution !== "2160p"));
  check("sources: recommended = best row", s.json?.releases?.[0]?.hash === s.json?.best?.hash && s.json?.best?.recommended === true);
  check("sources: no secrets in payload", noSecrets(s.text));
  check("sources: bad key → 400", (await admin.get("/api/sources?mediaKey=foo")).status === 400);
  const s4k = await admin.get(`/api/sources?mediaKey=${SPIDERMAN}&show4k=1`);
  check("sources show4k=1 → 2160p rows shown, best unchanged (cached direct)", s4k.status === 200 && s4k.json.releases.some((r) => r.parsed.resolution === "2160p") && s4k.json.best?.hash === s.json.best?.hash, s4k.json?.best?.qualityLabel);
  const t1 = Date.now();
  await admin.get(`/api/sources?mediaKey=${SPIDERMAN}`);
  check("sources second call served from memo (< 1.5 s)", Date.now() - t1 < 1500, `${Date.now() - t1}ms`);

  const ep = await admin.get(`/api/sources?mediaKey=${STRANGER}`);
  check("sources episode: episode echo + pack rows", ep.status === 200 && ep.json.episode?.season === 4 && ep.json.releases.some((r) => r.pack?.season === 4 && r.pack.episodes > 0), `${ep.status}`);
  const season = await admin.get("/api/sources/season?key=tv:66732&s=4");
  check("season chips: E1 known", season.status === 200 && season.json.episodes?.[1]?.cacheState !== undefined, JSON.stringify(season.json?.episodes?.[1]));

  // ---- "Lần trước" release prefs (title-level, same memoised lists → no extra provider call)
  await admin.del(`/api/sources/prefs?mediaKey=${SPIDERMAN}`);
  await admin.del("/api/sources/prefs?mediaKey=tv:66732");
  check("sources: no pref → preferredHash null + preferredApplies false", s.json?.preferredHash === null && s.json?.preferredApplies === false, JSON.stringify([s.json?.preferredHash, s.json?.preferredApplies]));
  check("prefs: bad hash → 400", (await admin.post("/api/sources/prefs", { mediaKey: SPIDERMAN, hash: "zz" })).status === 400);
  check("prefs: bad mediaKey → 400", (await admin.post("/api/sources/prefs", { mediaKey: "foo:1", hash: "a".repeat(40) })).status === 400);
  check("prefs: unknown hash → 404", (await admin.post("/api/sources/prefs", { mediaKey: SPIDERMAN, hash: "f".repeat(40) })).status === 404);
  check("prefs: DELETE without a row → deleted false", (await admin.del(`/api/sources/prefs?mediaKey=${SPIDERMAN}`)).json?.deleted === false);
  const epCached = ep.json.releases.find((r) => r.cacheState === "cached");
  if (!epCached) note("series pref echo skipped: no cached row for S4 T1 right now");
  else {
    const savedEp = await admin.post("/api/sources/prefs", { mediaKey: STRANGER, hash: epCached.hash });
    check("prefs: episode pick saved → applies on that episode", savedEp.status === 200 && savedEp.json?.preferredHash === epCached.hash && savedEp.json?.preferredApplies === true, JSON.stringify(savedEp.json));
    const epAgain = await admin.get(`/api/sources?mediaKey=${STRANGER}`);
    check("sources episode echoes the title-level pref", epAgain.json?.preferredHash === epCached.hash && epAgain.json?.preferredApplies === true);
    check("prefs: DELETE by the title key removes the episode pick", (await admin.del("/api/sources/prefs?mediaKey=tv:66732")).json?.deleted === true && (await admin.get(`/api/sources?mediaKey=${STRANGER}`)).json?.preferredHash === null);
  }

  // ---- scenarios
  await admin.post("/api/dev/scenario", { flags: ["all-uncached"] });
  const un = await admin.get(`/api/sources?mediaKey=${SPIDERMAN}`);
  check("all-uncached → every row uncached, best uncached", un.status === 200 && un.json.releases.every((r) => r.cacheState === "uncached") && un.json.best?.cacheState === "uncached" && un.json.best.recommended === false);
  // a pref on an uncached row is stored but never steers the primary: auto still answers 409 NOT_CACHED (no silent cloud download)
  const unPref = await admin.post("/api/sources/prefs", { mediaKey: SPIDERMAN, hash: un.json.releases[0].hash });
  check("prefs: uncached pick saved, preferredApplies false", unPref.status === 200 && unPref.json?.preferredHash === un.json.releases[0].hash && unPref.json?.preferredApplies === false, JSON.stringify(unPref.json));
  const unAuto = await admin.post("/api/play/resolve", { mediaKey: SPIDERMAN, auto: true });
  check("uncached pref never resolves: auto → 409 NOT_CACHED", unAuto.status === 409 && unAuto.json?.code === "NOT_CACHED", `${unAuto.status} ${unAuto.json?.code}`);
  check("resolve: bad pickReason → 400", (await admin.post("/api/play/resolve", { mediaKey: SPIDERMAN, hash: un.json.releases[0].hash, pickReason: "bogus" })).status === 400);
  check("prefs: DELETE → deleted true", (await admin.del(`/api/sources/prefs?mediaKey=${SPIDERMAN}`)).json?.deleted === true);
  await admin.post("/api/dev/scenario", { flags: ["torbox-down"] });
  const down = await admin.get(`/api/sources?mediaKey=${SPIDERMAN}`);
  check("torbox-down → 503 TORBOX_UNREACHABLE with releases kept", down.status === 503 && down.json?.code === "TORBOX_UNREACHABLE" && down.json.releases?.length >= 8 && down.json.state === "torbox-down");
  const downResolve = await admin.post("/api/play/resolve", { mediaKey: SPIDERMAN, auto: true });
  check("torbox-down → resolve 503", downResolve.status === 503, String(downResolve.status));
  await admin.post("/api/dev/scenario", { flags: [] });

  // ---- cloud jobs through the dev fake TorBox (cookie cloud-sim); the real createtorrent path is never hit for uncached hashes
  const hashes = s.json.releases.map((r) => r.hash);
  await admin.post("/api/dev/scenario", { flags: ["all-uncached", "cloud-sim=downloading:60:20"] });
  check("cloud job: unknown hash → 404", (await admin.post("/api/cloud/jobs", { mediaKey: SPIDERMAN, hash: "f".repeat(40) })).status === 404);
  const created = await admin.post("/api/cloud/jobs", { mediaKey: SPIDERMAN, hash: hashes[0] });
  check("cloud job created 201 downloading 60 %", created.status === 201 && created.json?.state === "downloading" && created.json.progress === 60 && created.json.mediaKey === SPIDERMAN, `${created.status} ${JSON.stringify(created.json).slice(0, 120)}`);
  const dup = await admin.post("/api/cloud/jobs", { mediaKey: SPIDERMAN, hash: hashes[0] });
  check("cloud job dedupe by hash → 200 same id", dup.status === 200 && dup.json?.id === created.json?.id);
  const list = await admin.get(`/api/cloud/jobs?mediaKey=${SPIDERMAN}`);
  check("cloud jobs list includes it", list.status === 200 && list.json.jobs.some((j) => j.id === created.json.id));
  const mine = await admin.get("/api/cloud/jobs?mine=1");
  check("cloud jobs ?mine=1", mine.status === 200 && mine.json.jobs.some((j) => j.id === created.json.id));
  const inSources = await admin.get(`/api/sources?mediaKey=${SPIDERMAN}`);
  check("sources row carries the job", inSources.json?.releases?.find((r) => r.hash === hashes[0])?.job?.state === "downloading");
  const me = await admin.get("/api/me");
  check("/api/me activeCloudJobs + activeJob", me.json?.activeCloudJobs >= 1 && typeof me.json.activeJob?.title === "string" && typeof me.json.activeJob?.progress === "number", JSON.stringify(me.json?.activeJob));

  // poller: 60 → 80 → 100 (5 s ticks) → ready + notification
  let readyJob = null;
  for (let i = 0; i < 8 && !readyJob; i++) {
    await sleep(5000);
    const l = await admin.get(`/api/cloud/jobs?mediaKey=${SPIDERMAN}`);
    readyJob = l.json?.jobs?.find((j) => j.id === created.json.id && j.state === "ready") ?? null;
  }
  check("poller moves the sim job to ready", readyJob !== null && readyJob.progress === 100, JSON.stringify(readyJob)?.slice(0, 100));
  const notif = await admin.get("/api/notifications");
  check("cloud_ready notification for the requester", notif.status === 200 && notif.json?.items?.some((n) => n.type === "cloud_ready" && !n.read));
  const afterReady = await admin.get(`/api/sources?mediaKey=${SPIDERMAN}`);
  check("ready job → row cached (sim) without persisting", afterReady.json?.releases?.find((r) => r.hash === hashes[0])?.cacheState === "cached");
  // "Lần trước" on the sim-cached row applies; the same pref moved to an uncached row stops applying (stale → hero note)
  const simPref = await admin.post("/api/sources/prefs", { mediaKey: SPIDERMAN, hash: hashes[0] });
  check("prefs: cached (sim) pick → preferredApplies true", simPref.status === 200 && simPref.json?.preferredHash === hashes[0] && simPref.json?.preferredApplies === true, JSON.stringify(simPref.json));
  const simSources = await admin.get(`/api/sources?mediaKey=${SPIDERMAN}`);
  check("sources: pref applies, best / recommended unchanged (ranking untouched)", simSources.json?.preferredHash === hashes[0] && simSources.json?.preferredApplies === true && simSources.json?.best?.hash === afterReady.json?.best?.hash);
  const uncachedHash = afterReady.json.releases.find((r) => r.cacheState === "uncached")?.hash;
  const movedPref = await admin.post("/api/sources/prefs", { mediaKey: SPIDERMAN, hash: uncachedHash });
  check("prefs: re-pick an uncached row → stored hash, applies false (one row per title)", movedPref.json?.preferredHash === uncachedHash && movedPref.json?.preferredApplies === false && (await admin.get(`/api/sources?mediaKey=${SPIDERMAN}`)).json?.preferredHash === uncachedHash);
  await admin.del(`/api/sources/prefs?mediaKey=${SPIDERMAN}`);
  await admin.post("/api/dev/scenario", { flags: [] });

  // queued + error + cancel + retry (seeded through the fixture)
  const seeded = await admin.post("/api/dev/seed", { fixture: "cloud-jobs", mediaKey: SPIDERMAN, title: "Người Nhện", jobs: [{ hash: hashes[1], state: "queued" }, { hash: hashes[2], state: "error" }] });
  check("seed queued + error jobs", seeded.status === 200 && seeded.json.ids?.length === 2);
  const l2 = (await admin.get(`/api/cloud/jobs?mediaKey=${SPIDERMAN}`)).json.jobs;
  const queued = l2.find((j) => j.hash === hashes[1]);
  const errored = l2.find((j) => j.hash === hashes[2]);
  check("queued job carries slots 10/10", queued?.state === "queued" && queued.queuedSlots?.active === 10 && queued.queuedSlots?.limit === 10, JSON.stringify(queued?.queuedSlots));
  check("error job carries errorMsg", errored?.state === "error" && /seed/.test(errored.errorMsg ?? ""), errored?.errorMsg);
  check("retry non-error job → 409", (await admin.post(`/api/cloud/jobs/${queued.id}/retry`)).status === 409);
  await admin.post("/api/dev/scenario", { flags: ["cloud-sim=downloading:0:50"] });
  const retried = await admin.post(`/api/cloud/jobs/${errored.id}/retry`);
  check("retry error job → downloading", retried.status === 200 && retried.json?.state === "downloading", `${retried.status} ${retried.json?.state}`);
  await admin.post("/api/dev/scenario", { flags: [] });
  check("cancel → 204", (await admin.del(`/api/cloud/jobs/${queued.id}`)).status === 204);
  check("cancel again → 404", (await admin.del(`/api/cloud/jobs/${queued.id}`)).status === 404);
  check("bad id → 400", (await admin.del("/api/cloud/jobs/abc")).status === 400);

  // auth scoping: a member cannot cancel the admin's job
  await admin.post("/api/dev/seed", { fixture: "user", username: "qa_member3", displayName: "QA", password: "QaMember123", onboarded: true });
  const member = client();
  check("member login", (await member.post("/api/auth/login", { username: "qa_member3", password: "QaMember123", remember: false })).status === 200);
  check("member cannot cancel another user's job → 403", (await member.del(`/api/cloud/jobs/${retried.json.id}`)).status === 403);
  check("member sees the title's jobs (shared TorBox)", (await member.get(`/api/cloud/jobs?mediaKey=${SPIDERMAN}`)).json?.jobs?.some((j) => j.id === retried.json.id));
  await member.post("/api/auth/logout");
  await admin.post("/api/dev/seed", { fixture: "delete-user", username: "qa_member3" });

  // ---- resolve (real TorBox: add_only_if_cached + requestdl) → streamId; probe = ONE server-side ≤ 1 MB Range request
  await admin.post("/api/dev/seed", { fixture: "clear-cloud-jobs" });
  if (process.env.QA_SKIP_REAL === "1") report.note("QA_SKIP_REAL=1: real TorBox resolve / CDN probe checks skipped (8 checks)");
  else await realResolveChecks(admin, s);
  check("/watch/unknown → 404", (await admin.get("/watch/" + "0".repeat(32))).status === 404);
  // ---- request + cached-only browse + home markers
  const reqRes = await admin.post("/api/sources/request", { mediaKey: SPIDERMAN });
  check("request title → ok", reqRes.status === 200 && reqRes.json?.ok === true);
  const cachedOnly = await admin.get("/api/catalog/discover?type=movie&cached=1&year=all");
  check("discover cached=1 → only cached cards from title_sources", cachedOnly.status === 200 && cachedOnly.json.items.length > 0 && cachedOnly.json.items.every((c) => c.cacheState === "cached"), `n=${cachedOnly.json?.items?.length}`);
  const hero = await admin.get("/api/catalog/hero");
  note(`hero cacheState present on ${hero.json?.items?.filter((h) => h.cacheState).length ?? 0}/5 slides`);
  const health = await admin.get("/api/health");
  check("health ok + torbox counters", health.status === 200 && health.json?.ok === true && typeof health.json.torbox?.calls === "number");
  note(`torbox calls this process: ${health.json?.torbox?.calls} (errors ${health.json?.torbox?.errors}, retries ${health.json?.torbox?.retries})`);
  report.finish();
}

main().catch((err) => { console.error(err); process.exit(1); });
