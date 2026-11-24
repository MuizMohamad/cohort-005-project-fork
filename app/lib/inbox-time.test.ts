import { describe, it, expect } from "vitest";
import { groupOf, timeAgo } from "./inbox-time";

// Built with the local-time Date constructor, so "midnight" is the viewer's
// own midnight wherever the tests run.
const NOW = new Date(2026, 9, 6, 12, 0, 0);

function minutesBefore(minutes: number) {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

describe("grouping into Today and Earlier", () => {
  it("puts items sent since the viewer's midnight in Today", () => {
    expect(groupOf(new Date(2026, 9, 6, 0, 0, 0).toISOString(), NOW)).toBe(
      "today"
    );
    expect(groupOf(minutesBefore(60), NOW)).toBe("today");
  });

  it("puts items sent before the viewer's midnight in Earlier", () => {
    expect(groupOf(new Date(2026, 9, 5, 23, 59, 0).toISOString(), NOW)).toBe(
      "earlier"
    );
    expect(groupOf(minutesBefore(3 * 24 * 60), NOW)).toBe("earlier");
  });
});

describe("the short time since an item was sent", () => {
  it("says just now, minutes, hours or days", () => {
    expect(timeAgo(minutesBefore(0), NOW)).toBe("just now");
    expect(timeAgo(minutesBefore(8), NOW)).toBe("8m ago");
    expect(timeAgo(minutesBefore(5 * 60 + 59), NOW)).toBe("5h ago");
    expect(timeAgo(minutesBefore(3 * 24 * 60 + 5), NOW)).toBe("3d ago");
  });
});
