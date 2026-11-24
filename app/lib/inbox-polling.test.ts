import { describe, it, expect } from "vitest";
import { NotificationKind } from "~/db/schema";
import type { InboxItem } from "./notifications.server";
import { mergeInboxItems } from "./inbox-polling";

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
