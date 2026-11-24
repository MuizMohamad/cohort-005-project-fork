import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { listInbox, sendRefundRequestRaised } from "./notifications.server";
import { startNotificationCleanup } from "./notification-cleanup.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);
const ONE_DAY = 24 * 60 * 60_000;

let db: TestDb;
let platformAdmin: typeof schema.users.$inferSelect;
let buyer: typeof schema.users.$inferSelect;
let stop: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  db = createTestDb();
  platformAdmin = addUser("Pat", UserRole.Admin);
  buyer = addUser("Sam", UserRole.Student);
});

afterEach(() => {
  stop?.();
  stop = undefined;
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
  sendRefundRequestRaised(
    db,
    buyer.id,
    buyer.name,
    courseTitle,
    new Date(Date.now() - days * ONE_DAY)
  );
}

function inboxTitles() {
  return listInbox(db, platformAdmin.id, "all", new Date()).map(
    (item) => item.text
  );
}

describe("the notification clean-up job", () => {
  it("cleans up as soon as it starts", () => {
    raisedDaysAgo("Too Old", 91);
    raisedDaysAgo("Recent", 1);

    stop = startNotificationCleanup(db);

    expect(inboxTitles()).toEqual(["Sam asked for a refund on Recent"]);
  });

  it("cleans up again once a day after that", () => {
    stop = startNotificationCleanup(db);
    raisedDaysAgo("Old By Tomorrow", 90);

    vi.advanceTimersByTime(ONE_DAY - 1);
    expect(inboxTitles()).toEqual(["Sam asked for a refund on Old By Tomorrow"]);

    vi.advanceTimersByTime(1);
    expect(inboxTitles()).toEqual([]);
  });

  it("survives a failed clean-up and tries again the next day", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.$client.exec("ALTER TABLE notifications RENAME TO notifications_away");

    expect(() => {
      stop = startNotificationCleanup(db);
    }).not.toThrow();

    db.$client.exec("ALTER TABLE notifications_away RENAME TO notifications");
    raisedDaysAgo("Too Old", 91);
    vi.advanceTimersByTime(ONE_DAY);

    expect(inboxTitles()).toEqual([]);
    expect(console.error).toHaveBeenCalledOnce();
  });
});
