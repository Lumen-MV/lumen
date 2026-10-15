import { z } from "zod";
import { parseMediaKey } from "@/lib/catalog/media-key";
import { insertJob, listActiveJobs, torboxQueue, updateJob } from "@/lib/cloud/cloud-jobs-store";
import { simSpecs } from "@/lib/cloud/cloud-queue";
import { simCreateTorrent, simReset, type CloudSimSpec } from "@/lib/cloud/cloud-sim-torbox";
import { copy } from "@/lib/copy-vi";
import { getDb, schema } from "@/lib/db/sqlite-client";

/**
 * Dev-only cloud-job fixtures (POST /api/dev/seed): rows wired to the fake TorBox (negative torrent ids), so the picker's
 * downloading / queued / error / ready rows and the logout dialog can be screenshotted without any real download.
 */
export const cloudFixtureSchemas = [
  z.object({
    fixture: z.literal("cloud-jobs"),
    mediaKey: z.string().min(4).max(40),
    title: z.string().min(1).max(200),
    jobs: z
      .array(
        z.object({
          hash: z.string().regex(/^[0-9a-f]{40}$/i),
          state: z.enum(["downloading", "queued", "error", "ready"]),
          progress: z.number().min(0).max(100).optional(),
          step: z.number().min(0).max(100).optional(),
          fileName: z.string().max(300).optional(),
          etaS: z.number().int().nonnegative().optional(),
          // Phase 6 admin queue: speed / size / app-side queue position / finish time / season pack (episode null)
          speedBps: z.number().int().nonnegative().optional(),
          sizeBytes: z.number().nonnegative().optional(),
          appQueued: z.boolean().optional(),
          finishedAt: z.coerce.date().optional(),
          pack: z.boolean().optional(),
        }),
      )
      .max(10),
  }),
  z.object({ fixture: z.literal("clear-cloud-jobs") }),
  z.object({ fixture: z.literal("clear-title-sources") }),
] as const;

type CloudJobsInput = z.infer<(typeof cloudFixtureSchemas)[0]>;

export function seedCloudJobs(input: CloudJobsInput, userId: number): { ids: number[] } {
  const key = parseMediaKey(input.mediaKey);
  if (!key) throw new Error("bad mediaKey");
  const ids: number[] = [];
  for (const j of input.jobs) {
    const hash = j.hash.toLowerCase();
    const progress = j.progress ?? (j.state === "ready" ? 100 : 0);
    const spec: CloudSimSpec = { kind: j.state, start: Math.min(99, progress), step: j.step ?? 0, active: 10, limit: 10, speedBps: j.speedBps, etaS: j.etaS, holdQueue: j.appQueued };
    const fileName = j.fileName ?? `${input.title}.mp4`;
    const row = insertJob({ userId, hash, mediaType: key.type, tmdbId: key.tmdbId, season: key.season ?? null, episode: j.pack ? null : (key.episode ?? null), title: input.title, releaseLabel: fileName, fileName, sizeBytes: Math.round(j.sizeBytes ?? 2_933_066_258), state: "queued" });
    simSpecs().set(row.id, spec);
    const created = simCreateTorrent(spec, hash, fileName);
    if (j.state === "queued" && j.appQueued) updateJob(row.id, { state: "queued", appQueuePos: listActiveJobs().filter((x) => x.appQueuePos !== null).length + 1 });
    else if (j.state === "queued") {
      torboxQueue().set(row.id, { queuedId: created.queued_id!, active: 10, limit: 10 });
      updateJob(row.id, { state: "queued" });
    } else if (j.state === "error") updateJob(row.id, { state: "error", torboxTorrentId: created.torrent_id, progress, errorMsg: copy.picker.failed });
    else if (j.state === "ready") updateJob(row.id, { state: "ready", torboxTorrentId: created.torrent_id, progress: 100, finishedAt: j.finishedAt ?? new Date() });
    else updateJob(row.id, { state: "downloading", torboxTorrentId: created.torrent_id, progress, speedBps: j.speedBps ?? 12_500_000, etaS: j.etaS ?? 60 });
    ids.push(row.id);
  }
  return { ids };
}

export function clearCloudJobs(): void {
  getDb().delete(schema.cloudJobs).run();
  torboxQueue().clear();
  simSpecs().clear();
  simReset();
}

export function clearTitleSources(): void {
  getDb().delete(schema.titleSources).run();
}
