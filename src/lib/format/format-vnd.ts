/** 3600 → "3.600" (Vietnamese thousands separator, mockup "3.600đ"). Shared by server and client components. */
export const formatVnd = (n: number): string => Math.round(n).toLocaleString("vi-VN");
