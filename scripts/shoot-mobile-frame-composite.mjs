// Builds qa/real-mobile-frame-default[-m].png like spikes/web-mockup/mobile-frame.html: three 390×844 phone frames
// (home · detail + source picker · player + Âm thanh/Phụ đề popover) on a #0b0c10 page, 10px #222 bezels, 30px gaps.
// Each screen runs in its own 390×844 mobile context logged in as the admin (same scenarios as the Phase 2-5 states).
// `composeMockMobileFrame` builds the mock side the same way from index.html / detail.html?state=mobile-sheet /
// player.html?state=popover (mobile-frame.html itself embeds the default states, so the pair would not be comparable).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "qa");
const PHONE = { w: 390, h: 844, bezel: 10 };
const PAGE = { w: 1440, h: 900, pad: 30, gap: 30, bg: [11, 12, 16] };
const MOVIE = "movie:634649";
const MOCK_SCREENS = ["index.html?m=1&bare=1", "detail.html?state=mobile-sheet&m=1&bare=1", "player.html?state=popover&m=1&bare=1"];
const PLAYING = () => { const v = document.querySelector("video"); return Boolean(v && !v.paused && v.currentTime > 0.3); };

const phoneContext = (browser) => browser.newContext({ viewport: { width: PHONE.w, height: PHONE.h }, isMobile: true, hasTouch: true, locale: "vi-VN" });

async function mobileContext(c) {
  const ctx = await phoneContext(c.page.context().browser());
  const r = await ctx.request.post(`${c.api.base}/api/auth/login`, { data: { username: c.api.admin.username, password: c.api.admin.password, remember: true } });
  if (!r.ok()) throw new Error(`mobile-frame login → ${r.status()}`);
  return ctx;
}

async function shoot(ctx, drive) {
  const page = await ctx.newPage();
  await drive(page);
  const png = await page.screenshot();
  await page.goto("about:blank").catch(() => {});
  await page.close();
  return PNG.sync.read(png);
}

const home = (c) => async (page) => {
  await page.goto(`${c.api.base}/`);
  await page.waitForSelector(".hero");
  await c.settle(page);
};
const detailWithPicker = (c) => async (page) => {
  await page.goto(`${c.api.base}/movie/634649`);
  await page.waitForSelector('[data-primary]:not([data-primary="loading"])', { timeout: 30000 });
  await page.click('[data-action="pick-other"]');
  await page.waitForSelector(".modal .box .src[data-hash]", { timeout: 30000 });
  await page.waitForTimeout(300);
};
const playerWithPopover = (c, ctx) => async (page) => {
  await ctx.request.post(`${c.api.base}/api/dev/scenario`, { data: { flags: ["play-sample", "subs-sim=popover"] } });
  const res = await ctx.request.post(`${c.api.base}/api/play/resolve`, { data: { mediaKey: MOVIE, auto: true } });
  if (!res.ok()) throw new Error(`resolve → ${res.status()}`);
  const { streamId } = await res.json();
  await page.goto(`${c.api.base}/watch/${streamId}`);
  await page.waitForFunction(PLAYING, null, { timeout: 20000 });
  await page.waitForSelector(".subs span", { timeout: 10000 }).catch(() => {});
  await page.mouse.move(190, 400);
  await page.mouse.move(200, 410);
  await page.waitForSelector('.player[data-controls="visible"]');
  await page.click('[data-action="cc"]');
  await page.waitForSelector('.pop [data-col="subs"] .it');
  await page.waitForTimeout(200);
  await ctx.request.post(`${c.api.base}/api/dev/scenario`, { data: { flags: [] } });
};

function compose(shots) {
  const out = new PNG({ width: PAGE.w, height: PAGE.h });
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] = PAGE.bg[0]; out.data[i + 1] = PAGE.bg[1]; out.data[i + 2] = PAGE.bg[2]; out.data[i + 3] = 255; }
  const frameW = PHONE.w + 2 * PHONE.bezel, frameH = PHONE.h + 2 * PHONE.bezel;
  const left = Math.round((PAGE.w - (3 * frameW + 2 * PAGE.gap)) / 2);
  shots.forEach((png, k) => {
    const x0 = left + k * (frameW + PAGE.gap), y0 = PAGE.pad;
    for (let y = 0; y < frameH && y0 + y < PAGE.h; y++) for (let x = 0; x < frameW; x++) {
      const i = ((y0 + y) * PAGE.w + x0 + x) * 4;
      const inner = x >= PHONE.bezel && x < PHONE.bezel + PHONE.w && y >= PHONE.bezel && y < PHONE.bezel + PHONE.h;
      if (inner) { const si = ((y - PHONE.bezel) * png.width + (x - PHONE.bezel)) * 4; out.data[i] = png.data[si]; out.data[i + 1] = png.data[si + 1]; out.data[i + 2] = png.data[si + 2]; }
      else { out.data[i] = 34; out.data[i + 1] = 34; out.data[i + 2] = 34; }
      out.data[i + 3] = 255;
    }
  });
  return PNG.sync.write(out);
}

/** Called from the routine's `afterShot`: overwrites qa/real-<name>[-m].png with the composite (same file for both viewports). */
export async function composeMobileFrame(c, name) {
  const ctx = await mobileContext(c);
  try {
    await c.api.seed({ fixture: "progress", rows: [] });
    const shots = [await shoot(ctx, home(c)), await shoot(ctx, detailWithPicker(c)), await shoot(ctx, playerWithPopover(c, ctx))];
    const suffix = (c.page.viewportSize()?.width ?? 1440) <= 700 ? "-m" : "";
    fs.writeFileSync(path.join(OUT, `real-${name}${suffix}.png`), compose(shots));
  } finally {
    await ctx.request.post(`${c.api.base}/api/auth/logout`).catch(() => {});
    await ctx.close();
  }
}

/** Mock side (`--mock`): the three mock pages at 390×844 in the states the real composite shows, written to `file`. */
export async function composeMockMobileFrame(page, mockDir, file) {
  const ctx = await phoneContext(page.context().browser());
  try {
    const shots = [];
    for (const screen of MOCK_SCREENS) {
      shots.push(await shoot(ctx, async (p) => {
        await p.goto("file:///" + path.join(mockDir, screen).replace(/\\/g, "/"));
        await p.waitForLoadState("load");
        await p.waitForTimeout(400);
      }));
    }
    fs.writeFileSync(file, compose(shots));
  } finally {
    await ctx.close();
  }
}
