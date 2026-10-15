/** `.pagehd > h1 + p` — browse / search page title + subtitle (subtitle may be empty like the mockup's error state). */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="pagehd">
      <h1>{title}</h1>
      <p>{subtitle ?? ""}</p>
    </div>
  );
}
