"use client";
import QRCode from "qrcode";

/** "Tải mã QR": renders the URL as a 600 px PNG and triggers a download (no server round-trip). */
export async function downloadQrPng(value: string, fileName: string): Promise<void> {
  const dataUrl = await QRCode.toDataURL(value, { width: 600, margin: 2, errorCorrectionLevel: "M" });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Clipboard write with the legacy fallback (http LAN origins have no `navigator.clipboard`). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn("[clipboard]", err); // handled: legacy path below
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}
