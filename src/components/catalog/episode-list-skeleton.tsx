/** series.html `loading`: 4 `.ep` rows with grey blocks (thumb #222, lines 40%/80%). */
export function EpisodeListSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div aria-hidden="true" data-episodes-loading>
      {Array.from({ length: n }, (_, i) => (
        <div className="ep" key={i}>
          <div className="num" />
          <div className="th" style={{ background: "#222", borderRadius: 4 }} />
          <div className="tx">
            <div style={{ width: "40%", height: 14, background: "#2a2a2a", borderRadius: 3, marginBottom: 8 }} />
            <div style={{ width: "80%", height: 12, background: "#222", borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
