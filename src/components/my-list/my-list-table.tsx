"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { copy } from "@/lib/copy-vi";
import { mediaHref } from "@/lib/catalog/media-key";
import { daysSince, type MyListItem } from "@/lib/my-list/my-list-reducers";

type Props = { items: MyListItem[]; busyKey: string | null; onPlay: (item: MyListItem) => void; onRemove: (item: MyListItem) => void };

/** my-list.html `list-view`: table (max 1000px) · poster 36×54 · Tên · Loại · Năm · Trạng thái tag · "N ngày trước" · ▶ ✕. */
export function MyListTable({ items, busyKey, onPlay, onRemove }: Props) {
  const m = copy.myList;
  return (
    <table className="mylist" style={{ maxWidth: 1000 }} data-view="list">
      <thead>
        <tr>
          <th />
          <th>{m.cols.name}</th>
          <th>{m.cols.type}</th>
          <th>{m.cols.year}</th>
          <th>{m.cols.status}</th>
          <th>{m.cols.added}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {items.map((it) => (
          <tr key={it.mediaKey} data-media-key={it.mediaKey}>
            <td>
              <Link href={mediaHref(it.type, it.tmdbId)} aria-label={it.title}>
                {it.posterUrl ? <img src={it.posterUrl} alt="" loading="lazy" style={{ width: 36, height: 54, objectFit: "cover", borderRadius: 3, display: "block" }} /> : <div style={{ width: 36, height: 54, background: "#222", borderRadius: 3 }} />}
              </Link>
            </td>
            <td>{it.title}</td>
            <td>{it.type === "tv" ? m.series : m.movies}</td>
            <td>{it.year}</td>
            <td>{it.cacheState === "cached" ? <Tag kind="g">{copy.tags.cached}</Tag> : <Tag kind="x">{m.uncached}</Tag>}</td>
            <td style={{ color: "#888" }}>{m.daysAgo(daysSince(it.addedAt))}</td>
            <td>
              <Button size="sm" loading={busyKey === it.mediaKey} aria-label={copy.player.aria.play} data-action="play" onClick={() => onPlay(it)}>
                {copy.progressUi.playGlyph}
              </Button>{" "}
              <Button size="sm" aria-label={m.removeTip} data-action="remove" onClick={() => onRemove(it)}>
                {copy.common.closeGlyph}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
