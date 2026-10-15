import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@/styles/tokens.css";
import "@/styles/shell.css";
import "@/styles/screens.css";
import "@/styles/states.css";
import "@/styles/app-additions.css";
import { ToastProvider } from "@/components/ui/toast-provider";
import { OfflineBanner } from "@/components/ui/offline-banner";

export const metadata: Metadata = {
  title: "Lumen",
  robots: { index: false, follow: false },
  // iPhone "Thêm vào màn hình chính" → standalone app with our icon
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Lumen", statusBarStyle: "black" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/** Root shell: ported mockup CSS (in mockup order), toast stack and the global offline banner. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <ToastProvider>
          <OfflineBanner />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
