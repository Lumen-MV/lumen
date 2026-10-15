"use client";
import { usePathname, useRouter } from "next/navigation";
import { requestOpenSearch } from "@/components/catalog/search-open-event";
import { onActivate } from "./activate-key";
import { Icon, type IconName } from "@/lib/icons";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";

export type TabKey = "home" | "search" | "list" | "profile";

const TABS: Array<{ key: TabKey; href: string; icon: IconName; label: string }> = [
  { key: "home", href: "/", icon: "home", label: copy.tab.home },
  { key: "search", href: "/search", icon: "search", label: copy.tab.search },
  { key: "list", href: "/my-list", icon: "list", label: copy.tab.list },
  { key: "profile", href: "/settings", icon: "user", label: copy.tab.profile },
];

function activeFromPath(pathname: string): TabKey {
  if (pathname.startsWith("/search")) return "search";
  if (pathname.startsWith("/my-list")) return "list";
  if (pathname.startsWith("/settings") || pathname.startsWith("/admin")) return "profile";
  return "home";
}

/**
 * `.tabbar > div[.on] > .ico + span` — only visible ≤700px via the ported CSS. Items are divs to keep the mockup selector.
 * "Tìm kiếm" opens the full-screen search sheet in place (the header 🔍 is hidden on phones) instead of navigating.
 */
export function MobileTabBar({ active }: { active?: TabKey }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = active ?? activeFromPath(pathname);
  const go = (t: (typeof TABS)[number]) => (t.key === "search" ? requestOpenSearch() : router.push(t.href));
  return (
    <div className="tabbar">
      {TABS.map((t) => (
        <div key={t.key} className={cx(t.key === current && "on")} role={t.key === "search" ? "button" : "link"} tabIndex={0} onClick={() => go(t)} onKeyDown={onActivate(() => go(t))}>
          <Icon name={t.icon} className="ico" />
          <span>{t.label}</span>
        </div>
      ))}
    </div>
  );
}
