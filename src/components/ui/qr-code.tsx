"use client";
import { useEffect, useState, type CSSProperties } from "react";
import QRCode from "qrcode";

type Props = { value: string; size: number; style?: CSSProperties; className?: string };

/** Real QR (qrcode package) inside the mockup's `.qr` box; the mockup used a checker gradient. */
export function QrCode({ value, size, style, className = "qr" }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { width: size * 2, margin: 0, errorCorrectionLevel: "M" })
      .then((url) => alive && setSrc(url))
      .catch((err) => console.error("[qr]", err));
    return () => {
      alive = false;
    };
  }, [value, size]);
  return (
    <div className={className} style={{ width: size, height: size, background: "#fff", ...style }}>
      {/* data: URL generated client-side; next/image adds nothing here */}
      {src &&<img src={src} alt="" width={size} height={size} />}
    </div>
  );
}
