import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NotificationKind } from "~/db/schema";
import type { InboxCheck, InboxItem } from "./notifications.server";
import {
  mergeInboxItems,
  newestItem,
  startInboxPolling,
  type PollResult,
} from "./inbox-polling";

const MINUTE = 60_000;

function fakeVisibility() {
  const listeners = new Set<() => void>();
  return {
    hidden: false,
    isHidden() {
      return this.hidden;
    },
    onVisibilityChange(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setHidden(hidden: boolean) {
      this.hidden = hidden;
      listeners.forEach((listener) => listener());
    },
  };
}

function ok(unreadCount: number): PollResult {
  return { status: "ok", check: { unreadCount, tab: null, items: null } };
}

describe("polling the inbox", () => {
  let visibility: ReturnType<typeof fakeVisibility>;
  let seen: InboxCheck[];
  let stop: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    visibility = fakeVisibility();
    seen = [];
  });

  afterEach(() => {
    stop?.();
    vi.useRealTimers();
  });

  function start(check: () => Promise<PollResult>) {
    const polling = startInboxPolling(check, (c) => seen.push(c), visibility);
    stop = polling.stop;
    return polling;
  }

  it("checks every 60 seconds while the tab is visible", async () => {
    const check = vi.fn(async () => ok(3));
    start(check);

    await vi.advanceTimersByTimeAsync(MINUTE - 1);
    expect(check).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(1);
    expect(seen.map((c) => c.unreadCount)).toEqual([3]);

    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("pauses while the tab is hidden and checks straight away on return", async () => {
    const check = vi.fn(async () => ok(1));
    start(check);

    visibility.setHidden(true);
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(check).not.toHaveBeenCalled();

    visibility.setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("stays quiet when a check fails and tries again 60 seconds later", async () => {
    const check = vi
      .fn<() => Promise<PollResult>>()
      .mockResolvedValueOnce({ status: "failed" })
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue(ok(4));
    start(check);

    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    expect(check).toHaveBeenCalledTimes(2);
    expect(seen).toEqual([]);

    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(check).toHaveBeenCalledTimes(3);
    expect(seen.map((c) => c.unreadCount)).toEqual([4]);
  });

  it("stops checking once the person is no longer signed in", async () => {
    const check = vi.fn(async (): Promise<PollResult> => ({
      status: "signed-out",
    }));
    start(check);

    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(check).toHaveBeenCalledTimes(1);

    visibility.setHidden(true);
    visibility.setHidden(false);
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("can check at once, then waits a full 60 seconds again", async () => {
    const check = vi.fn(async () => ok(2));
    const polling = start(check);

    await vi.advanceTimersByTimeAsync(40_000);
    polling.checkNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(MINUTE - 1);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("doesn't start checking while the tab starts hidden", async () => {
    visibility.hidden = true;
    const check = vi.fn(async () => ok(1));
    start(check);

    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(check).not.toHaveBeenCalled();
  });
});

function item(id: number, overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    kind: NotificationKind.RefundRequestRaised,
    text: `Item ${id}`,
    secondLine: null,
    outcome: null,
    href: "/admin/refunds",
    sentAt: "2026-10-06T12:00:00.000Z",
    isRead: false,
    ...overrides,
  };
}

describe("finding the newest item showing", () => {
  it("goes by send time, wherever the item sits in the list", () => {
    const showing = [
      item(7, { sentAt: "2026-10-06T12:00:00.000Z" }),
      item(9, { sentAt: "2026-10-06T12:05:00.000Z" }),
    ];

    expect(newestItem(showing)?.id).toBe(9);
  });

  it("breaks a tie on send time by the later id", () => {
    expect(newestItem([item(3), item(4)])?.id).toBe(4);
  });

  it("has none when nothing is showing", () => {
    expect(newestItem([])).toBeUndefined();
  });
});

describe("merging a check into the list showing", () => {
  it("adds new items at the top", () => {
    const showing = [item(2), item(1)];

    expect(
      mergeInboxItems(showing, [item(4), item(3), item(2), item(1)]).map(
        (i) => i.id
      )
    ).toEqual([4, 3, 2, 1]);
  });

  it("keeps items already showing in place, even when the check no longer has them", () => {
    const showing = [item(3), item(2), item(1)];

    expect(
      mergeInboxItems(showing, [item(5), item(1)]).map((i) => i.id)
    ).toEqual([5, 3, 2, 1]);
  });

  it("refreshes the details of items already showing", () => {
    const showing = [item(2), item(1)];

    const merged = mergeInboxItems(showing, [
      item(2, { isRead: true }),
      item(1),
    ]);

    expect(merged[0]).toMatchObject({ id: 2, isRead: true });
  });
});
