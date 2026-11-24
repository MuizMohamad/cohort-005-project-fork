import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  countUnread,
  deleteOldNotifications,
  listInbox,
  markRead,
  sendRefundRequestRaised,
} from "./notifications.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function minutesBefore(minutes: number) {
  return new Date(NOW.getTime() - minutes * 60_000);
}

let db: TestDb;
let platformAdmin: typeof schema.users.$inferSelect;
let buyer: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  platformAdmin = addUser("Pat", UserRole.Admin);
  buyer = addUser("Sam", UserRole.Student);
});

function addUser(name: string, role: UserRole) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

function raised(courseTitle: string, minutesAgo = 0) {
  sendRefundRequestRaised(
    db,
    buyer.id,
    buyer.name,
    courseTitle,
    minutesBefore(minutesAgo)
  );
}

describe("listing the inbox", () => {
  it("shows the newest first", () => {
    raised("Old Course", 30);
    raised("New Course", 5);
    raised("Middle Course", 10);

    expect(
      listInbox(db, platformAdmin.id, "all", NOW).map((item) => item.text)
    ).toEqual([
      "Sam asked for a refund on New Course",
      "Sam asked for a refund on Middle Course",
      "Sam asked for a refund on Old Course",
    ]);
  });

  it("shows only the newest 50 on the All tab", () => {
    for (let i = 60; i >= 1; i--) raised(`Course ${i}`, i);

    const all = listInbox(db, platformAdmin.id, "all", NOW);

    expect(all).toHaveLength(50);
    expect(all[0].text).toBe("Sam asked for a refund on Course 1");
    expect(all[49].text).toBe("Sam asked for a refund on Course 50");
  });

  it("shows every unread item on the Unread tab, even past 50", () => {
    for (let i = 60; i >= 1; i--) raised(`Course ${i}`, i);

    expect(listInbox(db, platformAdmin.id, "unread", NOW)).toHaveLength(60);
  });

  it("gives each item a short time since it was sent", () => {
    raised("A", 3 * 24 * 60 + 5);
    raised("B", 5 * 60 + 59);
    raised("C", 8);
    raised("D", 0);

    expect(
      listInbox(db, platformAdmin.id, "all", NOW).map((item) => item.timeAgo)
    ).toEqual(["just now", "8m ago", "5h ago", "3d ago"]);
  });

  it("keeps the names it was sent with after a rename", () => {
    raised("Intro to SQL");
    db.update(schema.users).set({ name: "Samantha" }).run();

    expect(listInbox(db, platformAdmin.id, "all", NOW)[0].text).toBe(
      "Sam asked for a refund on Intro to SQL"
    );
  });
});

describe("marking one read", () => {
  it("marks only that item and hands back the page it opens", () => {
    raised("First Course", 10);
    raised("Second Course", 5);
    const [newest] = listInbox(db, platformAdmin.id, "unread", NOW);

    const opened = markRead(db, platformAdmin.id, newest.id, NOW);

    expect(opened).toEqual({ href: "/admin/refunds" });
    expect(countUnread(db, platformAdmin.id)).toBe(1);
    expect(
      listInbox(db, platformAdmin.id, "all", NOW).map((item) => item.isRead)
    ).toEqual([true, false]);
  });

  it("can't touch another person's notification", () => {
    const otherAdmin = addUser("Quinn", UserRole.Admin);
    raised("Intro to SQL");
    const [theirs] = listInbox(db, otherAdmin.id, "unread", NOW);

    expect(markRead(db, platformAdmin.id, theirs.id, NOW)).toBeNull();
    expect(countUnread(db, otherAdmin.id)).toBe(1);
  });

  it("still opens an item that was already read", () => {
    raised("Intro to SQL");
    const [item] = listInbox(db, platformAdmin.id, "unread", NOW);
    markRead(db, platformAdmin.id, item.id, NOW);

    expect(markRead(db, platformAdmin.id, item.id, NOW)).toEqual({
      href: "/admin/refunds",
    });
    expect(countUnread(db, platformAdmin.id)).toBe(0);
  });
});

describe("counting unread", () => {
  it("gives the true count, even above 99", () => {
    for (let i = 0; i < 120; i++) raised("Intro to SQL", i);

    expect(countUnread(db, platformAdmin.id)).toBe(120);
  });

  it("counts only that person's own notifications", () => {
    raised("Intro to SQL");

    expect(countUnread(db, buyer.id)).toBe(0);
  });
});

describe("deleting old notifications", () => {
  const NINETY_DAYS_IN_MINUTES = 90 * 24 * 60;

  it("deletes items sent more than 90 days ago and keeps the rest", () => {
    raised("Too Old", NINETY_DAYS_IN_MINUTES + 1);
    raised("Exactly 90 Days", NINETY_DAYS_IN_MINUTES);
    raised("Recent", 5);

    deleteOldNotifications(db, NOW);

    expect(
      listInbox(db, platformAdmin.id, "all", NOW).map((item) => item.text)
    ).toEqual([
      "Sam asked for a refund on Recent",
      "Sam asked for a refund on Exactly 90 Days",
    ]);
  });

  it("deletes old items whether they were read or not", () => {
    raised("Old Read", NINETY_DAYS_IN_MINUTES + 10);
    raised("Old Unread", NINETY_DAYS_IN_MINUTES + 5);
    const oldRead = listInbox(db, platformAdmin.id, "all", NOW)[1];
    markRead(db, platformAdmin.id, oldRead.id, NOW);

    deleteOldNotifications(db, NOW);

    expect(listInbox(db, platformAdmin.id, "all", NOW)).toEqual([]);
  });
});
