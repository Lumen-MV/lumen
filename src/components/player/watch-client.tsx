"use client";
import { VideoPlayer } from "./video-player";

type Props = { streamId: string; fromContinue: boolean; seekTo: number | null; initialBackdropUrl: string | null };

/** Client boundary of /watch: keyed by streamId by the page so a different stream always remounts the player. */
export function WatchClient({ streamId, fromContinue, seekTo, initialBackdropUrl }: Props) {
  return <VideoPlayer streamId={streamId} fromContinue={fromContinue} seekTo={seekTo} initialBackdropUrl={initialBackdropUrl} />;
}
