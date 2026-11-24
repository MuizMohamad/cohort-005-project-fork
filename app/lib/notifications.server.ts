import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { notifications, users, NotificationKind, UserRole } from "~/db/schema";

// ─── Notifications ───
// Each person's in-app inbox. A send function per kind works out who gets it
// (never the person who caused it) and writes one row per recipient. The
// wording is built here when the inbox is listed, from names copied into the
// row at send time. See docs/specs/in-app-notifications.md.
//
// Every function takes the database first, so tests can hand in an in-memory
// one, and send functions also accept an open transaction so they can join
// the save that caused them. Uses positional parameters (project convention).

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

type Notification = typeof notifications.$inferSelect;

// ─── Sending ───

function platformAdminIdsExcept(db: Queryable, userId: number): number[] {
  return db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, UserRole.Admin), ne(users.id, userId)))
    .all()
    .map((row) => row.id);
}

/** Every Platform Admin but the buyer hears about a new Refund Request. */
export function sendRefundRequestRaised(
  db: Queryable,
  buyerId: number,
  buyerName: string,
  courseTitle: string,
  now: Date
) {
  const recipientIds = platformAdminIdsExcept(db, buyerId);
  if (recipientIds.length === 0) return;

  db.insert(notifications)
    .values(
      recipientIds.map((recipientId) => ({
        recipientId,
        kind: NotificationKind.RefundRequestRaised,
        actorName: buyerName,
        courseTitle,
        href: "/admin/refunds",
        sentAt: now.toISOString(),
      }))
    )
    .run();
}

// ─── Showing ───

function textOf(notification: Notification): string {
  switch (notification.kind) {
    case NotificationKind.RefundRequestRaised:
      return `${notification.actorName} asked for a refund on ${notification.courseTitle}`;
  }
}

export type InboxTab = "unread" | "all";

export type InboxItem = {
  id: number;
  kind: NotificationKind;
  text: string;
  href: string;
  sentAt: string;
  isRead: boolean;
};

/** One tab of a person's inbox, newest first, ready to show. */
export function listInbox(
  db: Queryable,
  userId: number,
  tab: InboxTab,
  now: Date
): InboxItem[] {
  const rows = db
    .select()
    .from(notifications)
    .where(
      tab === "unread"
        ? and(eq(notifications.recipientId, userId), isNull(notifications.readAt))
        : eq(notifications.recipientId, userId)
    )
    .orderBy(desc(notifications.sentAt), desc(notifications.id))
    .all();

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    text: textOf(row),
    href: row.href,
    sentAt: row.sentAt,
    isRead: row.readAt !== null,
  }));
}

export function countUnread(db: Queryable, userId: number): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(eq(notifications.recipientId, userId), isNull(notifications.readAt))
    )
    .get();

  return result?.count ?? 0;
}
