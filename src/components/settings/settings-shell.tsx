import Link from "next/link";
import type { ReactNode } from "react";
import { ScrollActiveIntoView } from "@/components/ui/scroll-active-into-view";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";

export type SettingsTab = (typeof copy.settings.tabs)[number];
export const isSettingsTab = (raw: string | undefined): raw is SettingsTab => (copy.settings.tabs as readonly string[]).includes(raw ?? "");

/** `.set > nav2 > a[.on] ×5 + div` (settings.html `shell()`); the left column becomes a scrolling strip above the content ≤ 700 px (active link kept in view). */
export function SettingsShell({ active, children }: { active: SettingsTab; children: ReactNode }) {
  return (
    <div className="set" data-settings={active}>
      <nav2>
        {copy.settings.tabs.map((tab, i) => (
          <Link key={tab} href={`/settings?tab=${tab}`} className={cx(tab === active && "on")} aria-current={tab === active ? "page" : undefined}>
            {copy.settings.nav[i]}
          </Link>
        ))}
        <ScrollActiveIntoView selector=".set nav2 a.on" />
      </nav2>
      <div>{children}</div>
    </div>
  );
}

/** `.sec > h2 + p.d? + children` */
export function SettingsSection({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="sec">
      <h2>{title}</h2>
      {desc && <p className="d">{desc}</p>}
      {children}
    </div>
  );
}

/** `.fld > .l(label + small) + control` */
export function SettingsField({ label, hint, children, style }: { label: string; hint?: string; children?: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="fld" style={style}>
      <div className="l">
        {label}
        {hint && <small>{hint}</small>}
      </div>
      {children}
    </div>
  );
}
