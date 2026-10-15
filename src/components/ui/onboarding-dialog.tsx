"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "./auth-card";
import { Button } from "./button";
import { useToast } from "./toast-provider";
import { StepsBar, StepQuality, StepSubtitles, StepTv, type Quality, type SubLang } from "./onboarding-steps";
import { copy } from "@/lib/copy-vi";
import type { PublicUser } from "@/lib/users/user-service";

type Step = 1 | 2 | 3;
const grow = { flex: 1, justifyContent: "center" } as const;

async function patchSettings(body: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/me/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`PATCH /api/me/settings ${res.status}`);
}

/**
 * First-visit gate (user.onboarded=false): 3 steps rendered in the mockup's `.auth/.form` card as an overlay.
 * Step 1 writes `quality`, step 2 `sub_lang` + `auto_translate`, step 3 shows the TV QR, then `onboarded=true`.
 */
export function OnboardingDialog({ user }: { user: PublicUser }) {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [quality, setQuality] = useState<Quality>("1080p");
  const [lang, setLang] = useState<SubLang>("vi");
  const [autoAi, setAutoAi] = useState(false); // opt-in: matches the `auto_translate` default
  const [manifestUrl, setManifestUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (step !== 3 || manifestUrl) return;
    fetch("/api/me/device-token")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { manifestUrl: string }) => setManifestUrl(d.manifestUrl))
      .catch((err) => console.error("[onboarding] device token", err));
  }, [step, manifestUrl]);

  const fail = (err: unknown) => {
    console.error("[onboarding]", err);
    toast({ type: "err", text: copy.login.offlineToast });
  };

  const advance = async (save: boolean) => {
    setBusy(true);
    try {
      if (save && step === 1) await patchSettings({ quality });
      if (save && step === 2) await patchSettings({ sub_lang: lang, auto_translate: autoAi });
      setStep((s) => (s < 3 ? ((s + 1) as Step) : s));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await patchSettings({ onboarded: true });
      setDone(true);
      router.refresh();
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  };

  if (done) return null;
  const o = copy.onboard;
  return (
    <AuthCard gate>
      <StepsBar step={step} />
      {step === 1 && <StepQuality name={user.displayName} value={quality} onChange={setQuality} />}
      {step === 2 && <StepSubtitles lang={lang} autoAi={autoAi} onLang={setLang} onAutoAi={setAutoAi} />}
      {step === 3 && <StepTv manifestUrl={manifestUrl} />}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Button style={grow} disabled={busy} onClick={() => (step === 3 ? finish() : advance(false))}>
          {step === 3 ? o.later : o.skip}
        </Button>
        <Button variant="red" style={{ ...grow, color: "#fff" }} disabled={busy} onClick={() => (step === 3 ? finish() : advance(true))}>
          {step === 3 ? o.finish : o.next}
        </Button>
      </div>
    </AuthCard>
  );
}
