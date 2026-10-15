import type { HTMLAttributes } from "react";

/** The mockup's settings page uses a bare `<nav2>` element for the left column (settings.html `.set nav2 a`). */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      nav2: HTMLAttributes<HTMLElement>;
    }
  }
}
