import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  listInbox,
  ONE_DAY_MS,
  sendRefundRequestRaised,
} from "./notifications.server";
import { startNotificationCleanup } from "./notification-cleanup.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let platformAdmin: typeof schema.users.$inferSelect;
let buyer: typeof schema.users.$inferSelect;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  db = createTestDb();
  base = seedBaseData(db);
  platformAdmin = addUser("Pat", UserRole.Admin);
  buyer = addUser("Sam", UserRole.Student);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function addUser(name: string, role: UserRole) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

function raisedDaysAgo(courseTitle: string, days: number) {
  const course = db
    .insert(schema.courses)
    .values({
      title: courseTitle,
      slug: courseTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      description: courseTitle,
      salesCopy: courseTitle,
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
  sendRefundRequestRaised(
    db,
    { buyerId: buyer.id, courseId: course.id },
    new Date(Date.now() - days * ONE_DAY_MS)
  );
}

function inboxTitles() {
  return listInbox(db, platformAdmin.id, "all").map(
    (item) => item.text
  );
}

describe("the notification clean-up job", () => {
  it("cleans up as soon as it starts", () => {
    raisedDaysAgo("Too Old", 91);
    raisedDaysAgo("Recent", 1);

    startNotificationCleanup(db);

    expect(inboxTitles()).toEqual(["Sam asked for a refund on Recent"]);
  });

  it("cleans up again once a day after that", () => {
    startNotificationCleanup(db);
    raisedDaysAgo("Old By Tomorrow", 90);

    vi.advanceTimersByTime(ONE_DAY_MS - 1);
    expect(inboxTitles()).toEqual([
      "Sam asked for a refund on Old By Tomorrow",
    ]);

    vi.advanceTimersByTime(1);
    expect(inboxTitles()).toEqual([]);
  });

  it("survives a failed clean-up and tries again the next day", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.$client.exec("ALTER TABLE notifications RENAME TO notifications_away");

    expect(() => {
      startNotificationCleanup(db);
    }).not.toThrow();

    db.$client.exec("ALTER TABLE notifications_away RENAME TO notifications");
    raisedDaysAgo("Too Old", 91);
    vi.advanceTimersByTime(ONE_DAY_MS);

    expect(inboxTitles()).toEqual([]);
    expect(console.error).toHaveBeenCalledOnce();
  });
});
