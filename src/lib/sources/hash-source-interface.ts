/** A provider of torrent hashes for an IMDb id (Torrentio today; Prowlarr/Comet later). Pure contract, no server imports. */
export type RawRelease = {
  /** lowercase 40-hex info hash */
  hash: string;
  /** release name (line 1 of Torrentio's title) */
  title: string;
  /** file name inside the torrent when the provider knows it (Torrentio `behaviorHints.filename` / pack line 2) */
  fileName?: string;
  fileIdx?: number;
  sizeBytes: number;
  seeders: number;
  /** indexer / tracker label ("YTS", "1337x") */
  tracker: string;
  /** magnet `tr=` / `dht` hints (Torrentio `sources[]`) */
  sources?: string[];
  /** provider-side pack detection (Torrentio: a 3-line title with an in-pack file name) */
  pack?: boolean;
};

export interface HashSource {
  readonly name: string;
  /** Movies: (imdbId). Series: (imdbId, season, episode). Throws on transport failure; resolves [] when nothing found. */
  search(imdbId: string, season?: number, episode?: number): Promise<RawRelease[]>;
}
