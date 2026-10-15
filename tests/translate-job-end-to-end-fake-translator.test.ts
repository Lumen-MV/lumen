import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Translate job against a real temp SQLite + DATA_DIR with the fake backend (scenario subs-sim): dedupe, one job per
 * user, daily limit, per-batch persistence, AI row + notification + activity + month cost, kie-down failure at 40 %.
 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-subs-"));
process.env.DATA_DIR = tmp;
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.ADMIN_USERNAME = "owner";
process.env.ADMIN_PASSWORD = "admin-pass-123";
process.env.LUMEN_SCENARIOS = "1";

vi.mock("@/lib/tmdb/catalog-queries-detail", () => ({ getMovie: async () => ({ title: "Người Nhện: Không Còn Nhà", imdbId: "tt10872600" }), getSeries: async () => ({ title: "x", imdbId: null }) }));
vi.mock("@/lib/translate/fake-translator", async (orig) => {
  const real = (await orig()) as typeof import("@/lib/translate/fake-translator");
  return { ...real, fakeTranslator: (o: Parameters<typeof real.fakeTranslator>[0] = {}) => real.fakeTranslator({ ...o, delayMs: 5 }) };
});

type Mods = { users: typeof import("@/lib/users/user-service"); store: typeof import("@/lib/subtitles/subtitle-store"); job: typeof import("@/lib/translate/subtitle-translate-job"); reg: typeof import("@/lib/translate/translate-job-registry"); db: typeof import("@/lib/db/sqlite-client"); settings: typeof import("@/lib/settings/app-settings"); finish: typeof import("@/lib/translate/translate-job-finish") };
let m: Mods;
let userId: number;
const KEY = "movie:634649";
const scenario = new Set<"subs-sim">(["subs-sim"]);
const params = new Map<"subs-sim", string>([["subs-sim", "popover-none"]]);
const until = async (ok: () => boolean, ms = 8000) => { const t0 = Date.now(); while (!ok()) { if (Date.now() - t0 > ms) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 25)); } };

beforeAll(async () => {
  m = { users: await import("@/lib/users/user-service"), store: await import("@/lib/subtitles/subtitle-store"), job: await import("@/lib/translate/subtitle-translate-job"), reg: await import("@/lib/translate/translate-job-registry"), db: await import("@/lib/db/sqlite-client"), settings: await import("@/lib/settings/app-settings"), finish: await import("@/lib/translate/translate-job-finish") };
  await m.users.seedAdminFromEnv();
  userId = m.users.findUserByUsername("owner")!.id;
});
afterAll(() => {
  m.db.closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function seedEnglish(n: number): number {
  const row = m.store.upsertCandidate({ mediaKey: KEY, lang: "en", source: "os", label: `Movie.en.${n}`, sourceFileId: `test-${n}`, downloads: 10 });
  return m.store.storeVtt(row.id, Array.from({ length: n }, (_, i) => ({ start: i * 1000, end: i * 1000 + 800, text: `line ${i}` }))).id;
}

describe("startTranslateJob (fake backend)", () => {
  it("runs 120 cues in 3 batches → AI row + notification + activity + month cost; second call dedupes", async () => {
    const src = seedEnglish(120);
    const out = await m.job.startTranslateJob({ userId, mediaKey: KEY, sourceSubId: src, scenario: scenario as never, params: params as never });
    expect(out.kind).toBe("started");
    const id = (out as { jobId: string }).jobId;
    await until(() => m.reg.getJob(id)?.state !== "running");
    const job = m.reg.getJob(id)!;
    expect(job).toMatchObject({ state: "done", percent: 100, total: 3 });
    expect(Object.keys(job.done)).toHaveLength(0); // finished jobs drop the translated text from memory
    expect(fs.existsSync(path.join(tmp, "jobs", `${id}.json`))).toBe(false); // sim jobs stay in memory
    const ai = m.store.findAiRowFor(KEY, src)!;
    expect(ai).toMatchObject({ lang: "vi", source: "ai", cueCount: 120, label: "Tiếng Việt (Dịch AI)" });
    expect(m.store.readVtt(ai)).toContain("[VI] line 119");
    expect(ai.costVnd).toBeGreaterThan(0);
    const { schema, getDb } = m.db;
    expect(getDb().select().from(schema.notifications).all().map((n) => [n.type, n.title])).toEqual([["subtitle_ready", "Người Nhện: Không Còn Nhà"]]);
    expect(getDb().select().from(schema.activityLog).all().some((a) => a.kind === "translate" && a.text.includes("120 dòng"))).toBe(true);
    expect(m.settings.getSetting<number>(m.finish.KEY_MONTH_COST, 0)).toBe(0); // sim jobs never bill the month counter
    expect(m.finish.addMonthCost(300)).toBe(300);
    expect(await m.job.startTranslateJob({ userId, mediaKey: KEY, sourceSubId: src, scenario: scenario as never, params: params as never })).toEqual({ kind: "exists", subId: ai.id });
  });
  it("kie-down: the job fails once past 40 % and reports the error; a running job blocks a second one", async () => {
    const src = seedEnglish(250);
    const sc = new Set(["kie-down"]);
    const out = await m.job.startTranslateJob({ userId, mediaKey: KEY, sourceSubId: src, scenario: sc as never, params: new Map() as never });
    expect(out.kind).toBe("started");
    const id = (out as { jobId: string }).jobId;
    expect((await m.job.startTranslateJob({ userId, mediaKey: KEY, sourceSubId: src, scenario: sc as never, params: new Map() as never })).kind).toBe("running");
    await until(() => m.reg.getJob(id)?.state !== "running");
    const job = m.reg.getJob(id)!;
    expect(job.state).toBe("error");
    expect(job.errorMsg).toMatch(/kie-down/);
    expect(JSON.parse(fs.readFileSync(path.join(tmp, "jobs", `${id}.json`), "utf8"))).toMatchObject({ id, state: "error" }); // real jobs persist per batch
    expect(job.percent).toBeGreaterThanOrEqual(40);
    expect(job.percent).toBeLessThan(100);
    expect(m.reg.jobStatusForUser(userId, KEY)).toMatchObject({ jobId: id, state: "error" });
  });
  it("Thử lại resumes the failed job (same id, finished batches kept, file keeps every batch) and a failed job never counts toward the daily limit", async () => {
    m.reg.clearJobsFor(userId);
    const src = seedEnglish(250); // 5 batches: kie-down lets 0 + 1 finish (≤ 40 %), fails at the 3rd
    const first = await m.job.startTranslateJob({ userId, mediaKey: KEY, sourceSubId: src, scenario: new Set(["kie-down"]) as never, params: new Map() as never });
    const id = (first as { jobId: string }).jobId;
    await until(() => m.reg.getJob(id)?.state !== "running");
    const failed = m.reg.getJob(id)!;
    expect(failed.state).toBe("error");
    expect(Object.keys(failed.done).sort()).toEqual(["0", "1"]);
    expect(m.reg.jobsTodayCount(userId)).toBe(0);
    const retry = await m.job.startTranslateJob({ userId, mediaKey: KEY, sourceSubId: src, scenario: scenario as never, params: new Map() as never });
    expect(retry).toEqual({ kind: "started", jobId: id });
    expect(m.reg.getJob(id)).toMatchObject({ state: "running", errorMsg: undefined });
    await until(() => m.reg.getJob(id)?.state !== "running");
    expect(m.reg.getJob(id)).toMatchObject({ state: "done", percent: 100, subId: expect.any(Number) });
    const persisted = JSON.parse(fs.readFileSync(path.join(tmp, "jobs", `${id}.json`), "utf8")) as { done: Record<string, string[]> };
    expect(Object.keys(persisted.done)).toHaveLength(5);
    expect(m.store.readVtt(m.store.findAiRowFor(KEY, src)!)).toContain("[VI] line 249");
    expect(m.reg.jobsTodayCount(userId)).toBe(1); // the resumed job counts once, as a finished job
    expect(m.reg.loadPersistedJobs().find((j) => j.id === id)?.done).toEqual({}); // boot reload drops the text of done jobs
  });
  it("a second viewer asking for the same source attaches to the running job: same id, may poll it, both are notified once", async () => {
    m.reg.clearJobsFor(userId);
    const other = await m.users.createUser({ username: "bao", displayName: "Bảo", password: "bao-pass-123" });
    const src = seedEnglish(121);
    const a = await m.job.startTranslateJob({ userId, mediaKey: KEY, sourceSubId: src, scenario: scenario as never, params: params as never });
    const id = (a as { jobId: string }).jobId;
    const b = await m.job.startTranslateJob({ userId: other.id, mediaKey: KEY, sourceSubId: src, scenario: scenario as never, params: params as never });
    expect(b).toEqual({ kind: "running", jobId: id });
    const job = m.reg.getJob(id)!;
    expect(job.requesters).toEqual([other.id]);
    expect(m.reg.canReadJob(job, other.id)).toBe(true);
    expect(m.reg.canReadJob(job, 9999)).toBe(false);
    expect(m.reg.jobStatusForUser(other.id, KEY)).toMatchObject({ jobId: id, state: "running" });
    await until(() => m.reg.getJob(id)?.state !== "running");
    const { schema, getDb } = m.db;
    const notified = getDb().select().from(schema.notifications).all().filter((n) => n.type === "subtitle_ready").map((n) => n.userId);
    expect(notified.filter((u) => u === other.id)).toHaveLength(1);
    expect(notified.filter((u) => u === userId).length).toBeGreaterThanOrEqual(1);
    expect(m.reg.jobsTodayCount(other.id)).toBe(0); // attaching never consumes the attached viewer's daily slot
  });
  it("daily limit: 5 persisted jobs in 24 h → limit; sim-frozen job sits at 42 %; bad inputs", async () => {
    m.reg.clearJobsFor(userId);
    m.reg.seedFinishedJobs(userId, KEY, 5);
    const src = seedEnglish(3);
    expect((await m.job.startTranslateJob({ userId, mediaKey: KEY, sourceSubId: src, scenario: new Set() as never, params: new Map() as never })).kind).toBe("limit");
    m.reg.clearJobsFor(userId);
    const frozen = await m.job.startTranslateJob({ userId, mediaKey: KEY, sourceSubId: src, scenario: scenario as never, params: new Map([["subs-sim", "popover-translating"]]) as never });
    expect(m.reg.getJob((frozen as { jobId: string }).jobId)).toMatchObject({ state: "running", percent: 42, sim: true });
    expect(m.reg.jobsTodayCount(userId)).toBe(0);
    m.reg.clearJobsFor(userId);
    expect(await m.job.startTranslateJob({ userId, mediaKey: KEY, sourceSubId: 999_999, scenario: new Set() as never, params: new Map() as never })).toEqual({ kind: "bad", reason: "NOT_FOUND" });
    const vi_ = m.store.upsertCandidate({ mediaKey: KEY, lang: "vi", source: "os", label: "vi", sourceFileId: "vi-1" });
    expect(await m.job.startTranslateJob({ userId, mediaKey: KEY, sourceSubId: vi_.id, scenario: new Set() as never, params: new Map() as never })).toEqual({ kind: "bad", reason: "NOT_ENGLISH" });
  });
  it("subtitle prefs: defaults from sub_size, PATCH semantics (0 = off)", () => {
    expect(m.store.getSubtitlePrefs(userId, KEY, "L")).toEqual({ offsetMs: 0, size: "L", selectedSubId: null });
    expect(m.store.setSubtitlePrefs(userId, KEY, { offsetMs: 500 }, "L")).toEqual({ offsetMs: 500, size: "L", selectedSubId: null });
    expect(m.store.setSubtitlePrefs(userId, KEY, { selectedSubId: 0 })).toMatchObject({ offsetMs: 500, selectedSubId: 0 });
    expect(m.store.deleteSubRowsFor(KEY)).toBeGreaterThan(0);
    expect(m.store.getSubtitlePrefs(userId, KEY).selectedSubId).toBeNull();
  });
});
