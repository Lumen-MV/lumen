import type { StreamMode } from "./player-manifest-types";

/**
 * Which IP (if any) `requestdl` is bound to. TorBox pins a link to `user_ip` when it is sent: in `direct` mode that
 * is the viewer (behind Caddy via X-Forwarded-For with TRUST_PROXY); in `proxy` mode the VM fetches the CDN itself, so
 * the viewer's IP must NOT be sent or the proxy would get 403 → relink ×2 → "Không lấy được link mới".
 */
export function viewerIpForStreamMode(mode: StreamMode, viewerIp: string | undefined): string | undefined {
  return mode === "proxy" ? undefined : viewerIp;
}
