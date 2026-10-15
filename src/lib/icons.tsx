import type { SVGProps } from "react";

/** SVG paths ported 1:1 from mockup-shell.js (SVG) and screen-player.js (ICON). Rendered with class `ico`. */
const PATHS = {
  search: "M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm8.3 13.3l3.4 3.4-1.4 1.4-3.4-3.4z",
  bell: "M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.9V4a1 1 0 0 0-2 0v1.1A6 6 0 0 0 6 11v5l-2 2v1h16v-1z",
  home: "M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z",
  list: "M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z",
  user: "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5 0-9 2.5-9 5v3h18v-3c0-2.5-4-5-9-5z",
  back: "M15 4l-8 8 8 8 1.5-1.5L10 12l6.5-6.5z",
  pause: "M6 19h4V5H6zm8-14v14h4V5z",
  play: "M8 5v14l11-7z",
  b10: "M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z",
  f10: "M12 5V2l5 4-5 4V7a5 5 0 1 0 5 5h2a7 7 0 1 1-7-7z",
  vol: "M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z",
  next: "M4 18l8.5-6L4 6zm10-12v12h3V6z",
  eps: "M4 4h16v12H4zm2 2v8h12V6zM8 19h8v2H8z",
  cc: "M20 4H4v16h16zM8 15H6v-2h2zm4 0h-2v-2h2zm6 0h-4v-2h4zM18 11H6V9h12z",
  cast: "M21 3H3v4h2V5h14v14h-6v2h8zM3 19v2h2a2 2 0 0 0-2-2zm0-4v2a4 4 0 0 1 4 4h2a6 6 0 0 0-6-6zm0-4v2a8 8 0 0 1 8 8h2A10 10 0 0 0 3 11z",
  pip: "M19 7h-8v6h8zm2-4H3v18h18zm-2 16H5V5h14z",
  fs: "M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z",
  speed: "M12 4a8 8 0 0 0-8 8c0 2.2.9 4.2 2.3 5.7l1.4-1.4A6 6 0 1 1 18 12h2a8 8 0 0 0-8-8zm-1 9l5-5-1.4-1.4L10 11.2z",
} as const;

export type IconName = keyof typeof PATHS;

type IconProps = SVGProps<SVGSVGElement> & { name: IconName };

/** `<Icon name="search" />` → `<svg class="ico [search]"><path d=…/></svg>` exactly like the mockup. */
export function Icon({ name, className, ...rest }: IconProps) {
  const cls = className ?? (name === "search" ? "ico search" : "ico");
  const withLabel = name === "b10" || name === "f10";
  return (
    <svg className={cls} viewBox="0 0 24 24" aria-hidden="true" {...rest}>
      <path d={PATHS[name]} />
      {withLabel && (
        <text x="9" y="15" fontSize="6" fill="#fff" fontFamily="Arial">
          10
        </text>
      )}
    </svg>
  );
}
