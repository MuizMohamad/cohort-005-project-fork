import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  checkInbox,
  countUnread,
  deleteOldNotifications,
  listInbox,
  markAllReadUpTo,
  markRead,
  sendQuestionAsked,
  sendRefundRequestRaised,
} from "./notifications.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function minutesBefore(minutes: number) {
  return new Date(NOW.getTime() - minutes * 60_000);
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let platformAdmin: typeof schema.users.$inferSelect;
let buyer: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
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

function courseTitled(title: string) {
  const existing = db
    .select()
    .from(schema.courses)
    .where(eq(schema.courses.title, title))
    .get();
  if (existing) return existing;

  return db
    .insert(schema.courses)
    .values({
      title,
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      description: title,
      salesCopy: title,
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
}

function raised(courseTitle: string, minutesAgo = 0) {
  sendRefundRequestRaised(
    db,
    { buyerId: buyer.id, courseId: courseTitled(courseTitle).id },
    minutesBefore(minutesAgo)
  );
}

describe("listing the inbox", () => {
  it("shows the newest first", () => {
    raised("Old Course", 30);
    raised("New Course", 5);
    raised("Middle Course", 10);

    expect(
      listInbox(db, platformAdmin.id, "all").map((item) => item.text)
    ).toEqual([
      "Sam asked for a refund on New Course",
      "Sam asked for a refund on Middle Course",
      "Sam asked for a refund on Old Course",
    ]);
  });

  it("shows only the newest 50 on the All tab", () => {
    for (let i = 60; i >= 1; i--) raised(`Course ${i}`, i);

    const all = listInbox(db, platformAdmin.id, "all");

    expect(all).toHaveLength(50);
    expect(all[0].text).toBe("Sam asked for a refund on Course 1");
    expect(all[49].text).toBe("Sam asked for a refund on Course 50");
  });

  it("shows every unread item on the Unread tab, even past 50", () => {
    for (let i = 60; i >= 1; i--) raised(`Course ${i}`, i);

    expect(listInbox(db, platformAdmin.id, "unread")).toHaveLength(60);
  });

  it("keeps the names it was sent with after a rename", () => {
    raised("Intro to SQL");
    db.update(schema.users).set({ name: "Samantha" }).run();

    expect(listInbox(db, platformAdmin.id, "all")[0].text).toBe(
      "Sam asked for a refund on Intro to SQL"
    );
  });

  it("keeps the course title it was sent with after the course is renamed", () => {
    raised("Intro to SQL");
    db.update(schema.courses)
      .set({ title: "SQL for Everyone" })
      .where(eq(schema.courses.title, "Intro to SQL"))
      .run();

    expect(listInbox(db, platformAdmin.id, "all")[0].text).toBe(
      "Sam asked for a refund on Intro to SQL"
    );
  });

  it("keeps its text after its lesson is deleted", () => {
    const module = db
      .insert(schema.modules)
      .values({ courseId: base.course.id, title: "Basics", position: 1 })
      .returning()
      .get();
    const lesson = db
      .insert(schema.lessons)
      .values({ moduleId: module.id, title: "Joins", position: 1 })
      .returning()
      .get();
    sendQuestionAsked(db, { authorId: buyer.id, lessonId: lesson.id }, NOW);

    db.delete(schema.lessons).where(eq(schema.lessons.id, lesson.id)).run();

    expect(listInbox(db, base.instructor.id, "all")[0].text).toBe(
      "Sam asked a question on Joins in Test Course"
    );
  });
});

describe("checking the inbox", () => {
  it("gives only the unread count when no tab is asked for", () => {
    raised("Intro to SQL");
    raised("Advanced SQL");

    expect(checkInbox(db, platformAdmin.id, null)).toEqual({
      unreadCount: 2,
      tab: null,
      items: null,
    });
  });

  it("adds the asked-for tab of the inbox", () => {
    raised("Intro to SQL", 10);
    raised("Advanced SQL", 5);
    const [newest] = listInbox(db, platformAdmin.id, "unread");
    markRead(db, platformAdmin.id, newest.id, NOW);

    const check = checkInbox(db, platformAdmin.id, "unread");

    expect(check.unreadCount).toBe(1);
    expect(check.tab).toBe("unread");
    expect(check.items?.map((item) => item.text)).toEqual([
      "Sam asked for a refund on Intro to SQL",
    ]);
  });

  it("only gives that person's own inbox", () => {
    raised("Intro to SQL");

    expect(checkInbox(db, buyer.id, "all")).toEqual({
      unreadCount: 0,
      tab: "all",
      items: [],
    });
  });
});

describe("marking one read", () => {
  it("marks only that item and hands back the page it opens", () => {
    raised("First Course", 10);
    raised("Second Course", 5);
    const [newest] = listInbox(db, platformAdmin.id, "unread");

    const opened = markRead(db, platformAdmin.id, newest.id, NOW);

    expect(opened).toEqual({ href: "/admin/refunds" });
    expect(countUnread(db, platformAdmin.id)).toBe(1);
    expect(
      listInbox(db, platformAdmin.id, "all").map((item) => item.isRead)
    ).toEqual([true, false]);
  });

  it("can't touch another person's notification", () => {
    const otherAdmin = addUser("Quinn", UserRole.Admin);
    raised("Intro to SQL");
    const [theirs] = listInbox(db, otherAdmin.id, "unread");

    expect(markRead(db, platformAdmin.id, theirs.id, NOW)).toBeNull();
    expect(countUnread(db, otherAdmin.id)).toBe(1);
  });

  it("still opens an item that was already read", () => {
    raised("Intro to SQL");
    const [item] = listInbox(db, platformAdmin.id, "unread");
    markRead(db, platformAdmin.id, item.id, NOW);

    expect(markRead(db, platformAdmin.id, item.id, NOW)).toEqual({
      href: "/admin/refunds",
    });
    expect(countUnread(db, platformAdmin.id)).toBe(0);
  });
});

describe("marking all read up to an item", () => {
  it("marks that item and everything older, leaving anything newer unread", () => {
    raised("Oldest Course", 30);
    raised("Shown Course", 20);
    const [newestShown] = listInbox(db, platformAdmin.id, "all");
    raised("Newer Course", 5);

    markAllReadUpTo(db, platformAdmin.id, newestShown.id, NOW);

    expect(
      listInbox(db, platformAdmin.id, "unread").map((item) => item.text)
    ).toEqual(["Sam asked for a refund on Newer Course"]);
  });

  it("goes by when items were sent, not the order they were saved", () => {
    raised("Shown Course", 20);
    const [newestShown] = listInbox(db, platformAdmin.id, "all");
    raised("Late-saved Older Course", 40);

    markAllReadUpTo(db, platformAdmin.id, newestShown.id, NOW);

    expect(countUnread(db, platformAdmin.id)).toBe(0);
  });

  it("leaves another person's notifications alone", () => {
    const otherAdmin = addUser("Quinn", UserRole.Admin);
    raised("Intro to SQL", 10);
    const [newestShown] = listInbox(db, platformAdmin.id, "all");

    markAllReadUpTo(db, platformAdmin.id, newestShown.id, NOW);

    expect(countUnread(db, platformAdmin.id)).toBe(0);
    expect(countUnread(db, otherAdmin.id)).toBe(1);
  });

  it("does nothing when the item isn't theirs", () => {
    const otherAdmin = addUser("Quinn", UserRole.Admin);
    raised("Intro to SQL", 10);
    const [theirs] = listInbox(db, otherAdmin.id, "all");

    markAllReadUpTo(db, platformAdmin.id, theirs.id, NOW);

    expect(countUnread(db, platformAdmin.id)).toBe(1);
    expect(countUnread(db, otherAdmin.id)).toBe(1);
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
      listInbox(db, platformAdmin.id, "all").map((item) => item.text)
    ).toEqual([
      "Sam asked for a refund on Recent",
      "Sam asked for a refund on Exactly 90 Days",
    ]);
  });

  it("deletes old items whether they were read or not", () => {
    raised("Old Read", NINETY_DAYS_IN_MINUTES + 10);
    raised("Old Unread", NINETY_DAYS_IN_MINUTES + 5);
    const oldRead = listInbox(db, platformAdmin.id, "all")[1];
    markRead(db, platformAdmin.id, oldRead.id, NOW);

    deleteOldNotifications(db, NOW);

    expect(listInbox(db, platformAdmin.id, "all")).toEqual([]);
  });
});
