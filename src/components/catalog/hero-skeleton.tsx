/** `.hero.skhero > .t > div×4` with the mockup sizes 520×54, 300×16, 600×40, 260×44 (screen-home.js `loading`). */
export function HeroSkeleton() {
  return (
    <div className="hero skhero" aria-hidden="true">
      <div className="t">
        <div style={{ width: 520, height: 54 }} />
        <div style={{ width: 300, height: 16 }} />
        <div style={{ width: 600, height: 40 }} />
        <div style={{ width: 260, height: 44 }} />
      </div>
    </div>
  );
}
