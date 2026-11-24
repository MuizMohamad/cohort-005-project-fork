import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NotificationKind } from "~/db/schema";
import type { InboxCheck, InboxItem } from "./notifications.server";
import {
  mergeInboxItems,
  startInboxPolling,
  type CheckOutcome,
} from "./inbox-polling";

const MINUTE = 60_000;

function fakePage() {
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

function ok(unreadCount: number): CheckOutcome {
  return { status: "ok", check: { unreadCount, tab: null, items: null } };
}

describe("polling the inbox", () => {
  let page: ReturnType<typeof fakePage>;
  let seen: InboxCheck[];
  let stop: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    page = fakePage();
    seen = [];
  });

  afterEach(() => {
    stop?.();
    vi.useRealTimers();
  });

  function start(check: () => Promise<CheckOutcome>) {
    const polling = startInboxPolling(check, (c) => seen.push(c), page);
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

    page.setHidden(true);
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(check).not.toHaveBeenCalled();

    page.setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("stays quiet when a check fails and tries again 60 seconds later", async () => {
    const check = vi
      .fn<() => Promise<CheckOutcome>>()
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
    const check = vi.fn(async (): Promise<CheckOutcome> => ({
      status: "signed-out",
    }));
    start(check);

    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(check).toHaveBeenCalledTimes(1);

    page.setHidden(true);
    page.setHidden(false);
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
    page.hidden = true;
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
    href: "/admin/refunds",
    sentAt: "2026-10-06T12:00:00.000Z",
    timeAgo: "just now",
    isRead: false,
    ...overrides,
  };
}

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
    const showing = [item(2, { timeAgo: "just now" }), item(1)];

    const merged = mergeInboxItems(showing, [
      item(2, { timeAgo: "1m ago", isRead: true }),
      item(1),
    ]);

    expect(merged[0]).toMatchObject({ id: 2, timeAgo: "1m ago", isRead: true });
  });
});
