"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScrollActiveIntoView } from "@/components/ui/scroll-active-into-view";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";

/** `.atabs > a[.on] ×4` under the "Quản trị" h1; the active tab follows the pathname (`/admin` exact, others by prefix) and is scrolled into view on phones. */
export function AdminTabs() {
  const pathname = usePathname();
  const active = copy.admin.tabHrefs.findIndex((href, i) => (i === 0 ? pathname === href : pathname.startsWith(href)));
  return (
    <div className="atabs" role="tablist">
      {copy.admin.tabs.map((label, i) => (
        <Link key={label} href={copy.admin.tabHrefs[i]} className={cx(i === active && "on")} role="tab" aria-selected={i === active}>
          {label}
        </Link>
      ))}
      <ScrollActiveIntoView selector=".atabs a.on" />
    </div>
  );
}
