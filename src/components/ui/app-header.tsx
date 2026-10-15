"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { onActivate } from "./activate-key";
import { AvatarMenu } from "./avatar-menu";
import { NotificationsDropdown } from "@/components/catalog/notifications-dropdown";
import { SearchOverlay } from "@/components/catalog/search-overlay";
import { Icon } from "@/lib/icons";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";
import type { PublicUser } from "@/lib/users/user-service";

export type NavKey = "home" | "movies" | "series" | "anime" | "myList";

const NAV: Array<{ key: NavKey; href: string; label: string }> = [
  { key: "home", href: "/", label: copy.nav.home },
  { key: "movies", href: "/movies", label: copy.nav.movies },
  { key: "series", href: "/series", label: copy.nav.series },
  { key: "anime", href: "/anime", label: copy.nav.anime },
  { key: "myList", href: "/my-list", label: copy.nav.myList },
];

/** `/series/123` is a detail page (nav "Phim bộ" stays lit); `/movie/123` lights nothing, like the mockup's detail header. */
function activeFromPath(pathname: string): NavKey | null {
  if (pathname === "/") return "home";
  const hit = NAV.find((n) => n.key !== "home" && pathname.startsWith(n.href));
  return hit?.key ?? null;
}

type Props = { user: PublicUser; unread?: number; active?: NavKey | null };

/** `header > .logo + nav(a.on) + .sp + .hicons(search, bell[+badge], avatar)`; adds `.solid` after 40px scroll; hosts the search overlay + notifications dropdown. */
export function AppHeader({ user, unread: initialUnread = 0, active }: Props) {
  const pathname = usePathname();
  const current = active === undefined ? activeFromPath(pathname) : active;
  const [solid, setSolid] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const bellRef = useRef<HTMLSpanElement>(null);

  useEffect(() => setUnread(initialUnread), [initialUnread]);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY >= 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // route change closes both popups
  useEffect(() => {
    setSearchOpen(false);
    setNotifOpen(false);
  }, [pathname]);

  const openSearch = useCallback((o: boolean) => {
    setSearchOpen(o);
    if (o) setNotifOpen(false);
  }, []);
  const openNotif = useCallback((o: boolean) => {
    setNotifOpen(o);
    if (o) setSearchOpen(false);
  }, []);

  return (
    <header className={cx(solid && "solid")}>
      <Link href="/" className="logo">
        {copy.app.name}
      </Link>
      <nav>
        {NAV.map((n) => (
          <Link key={n.key} href={n.href} className={cx(n.key === current && "on")}>
            {n.label}
          </Link>
        ))}
      </nav>
      <span className="sp" />
      <div className="hicons">
        <Icon name="search" role="button" tabIndex={0} aria-label={copy.search.placeholder} onClick={() => openSearch(!searchOpen)} onKeyDown={onActivate(() => openSearch(true))} />
        <span ref={bellRef} className="bell-wrap" role="button" tabIndex={0} aria-label={copy.notif.title} aria-expanded={notifOpen} onClick={() => openNotif(!notifOpen)} onKeyDown={onActivate(() => openNotif(!notifOpen))}>
          <Icon name="bell" />
          {unread > 0 && <span className="badge-dot">{unread}</span>}
        </span>
        <AvatarMenu user={user} />
      </div>
      <SearchOverlay open={searchOpen} onOpenChange={openSearch} />
      <NotificationsDropdown open={notifOpen} onOpenChange={openNotif} onUnreadChange={setUnread} anchorRef={bellRef} />
    </header>
  );
}
