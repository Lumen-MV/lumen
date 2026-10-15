import { redirect } from "next/navigation";
import { PlaybackSection } from "@/components/settings/playback-section";
import { ProfileSection } from "@/components/settings/profile-section";
import { SessionsSection } from "@/components/settings/sessions-section";
import { isSettingsTab, SettingsShell } from "@/components/settings/settings-shell";
import { SubtitlesSection } from "@/components/settings/subtitles-section";
import { TvSection } from "@/components/settings/tv-section";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { deviceTokenDto, sessionRows, subtitleStats } from "@/lib/settings/settings-page-data";
import { getUserSettings } from "@/lib/users/user-settings";

export const dynamic = "force-dynamic";

/** /settings?tab=profile|playback|subtitles|tv|sessions — settings.html (9 states). Unknown tab → Hồ sơ. */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const { tab } = await searchParams;
  const active = isSettingsTab(tab) ? tab : "profile";
  const section = async () => {
    switch (active) {
      case "profile":
        return <ProfileSection user={me.user} />;
      case "playback":
        return <PlaybackSection initial={getUserSettings(me.user.id)} />;
      case "subtitles":
        return <SubtitlesSection initial={getUserSettings(me.user.id)} stats={await subtitleStats()} />;
      case "tv":
        return <TvSection initial={deviceTokenDto(me.user.id)} />;
      case "sessions":
        return <SessionsSection initial={sessionRows(me.user.id, me.sessionId)} />;
    }
  };
  return <SettingsShell active={active}>{await section()}</SettingsShell>;
}
