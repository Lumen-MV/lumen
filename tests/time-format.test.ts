import { describe, expect, it } from "vitest";
import { formatClock, formatCountdown, formatDate, formatDayMonth, formatRelativeVi, formatRuntimeEn, formatRuntimeVi, parseLocalDate } from "@/lib/format/time-format";

describe("time-format", () => {
  it("parses TMDB YYYY-MM-DD as a local date (no UTC off-by-one)", () => {
    const d = parseLocalDate("2026-10-15");
    expect(d && [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 15, 0]);
    expect(d && formatDayMonth(d)).toBe("15/10");
    expect(parseLocalDate("2026-10-15T00:00:00Z")?.getDate()).toBe(15);
    expect(parseLocalDate("")).toBeNull();
    expect(parseLocalDate(null)).toBeNull();
    expect(parseLocalDate("15/10/2026")).toBeNull();
  });

  it("formats player clock and countdown", () => {
    expect(formatClock(5228)).toBe("1:27:08");
    expect(formatClock(312)).toBe("5:12");
    expect(formatCountdown(292)).toBe("4:52");
    expect(formatCountdown(0)).toBe("0:00");
  });

  it("formats runtimes", () => {
    expect(formatRuntimeEn(148)).toBe("2h 28m");
    expect(formatRuntimeVi(76)).toBe("1g 16p");
  });

  it("formats dates dd/mm[/yyyy]", () => {
    const d = new Date(2026, 9, 13, 10, 0, 0);
    expect(formatDate(d)).toBe("13/10/2026");
    expect(formatDayMonth(d)).toBe("13/10");
  });

  it("formats Vietnamese relative time", () => {
    const now = new Date(2026, 9, 14, 12, 0, 0);
    expect(formatRelativeVi(new Date(now.getTime() - 30_000), now)).toBe("Vừa xong");
    expect(formatRelativeVi(new Date(now.getTime() - 2 * 60_000), now)).toBe("2 phút trước");
    expect(formatRelativeVi(new Date(now.getTime() - 3 * 3_600_000), now)).toBe("3 giờ trước");
    expect(formatRelativeVi(new Date(now.getTime() - 26 * 3_600_000), now)).toBe("Hôm qua");
    expect(formatRelativeVi(new Date(now.getTime() - 5 * 86_400_000), now)).toBe("5 ngày trước");
    expect(formatRelativeVi(new Date(2026, 0, 1), now)).toBe("01/01/2026");
  });
});
