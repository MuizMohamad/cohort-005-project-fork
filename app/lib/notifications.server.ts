import { and, desc, eq, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  notifications,
  users,
  NotificationKind,
  RefundStatus,
  UserRole,
} from "~/db/schema";

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

/**
 * The buyer hears the outcome of their Refund Request, with the decision note,
 * and every other Platform Admin hears who decided it. The decider hears
 * nothing, and a buyer who is also a Platform Admin gets only the buyer item.
 */
export function sendRefundRequestDecided(
  db: Queryable,
  buyerId: number,
  deciderId: number,
  deciderName: string,
  courseTitle: string,
  courseSlug: string,
  outcome: RefundStatus.Approved | RefundStatus.Declined,
  note: string | null,
  now: Date
) {
  const sentAt = now.toISOString();
  const forBuyer = {
    recipientId: buyerId,
    kind: NotificationKind.RefundRequestDecided,
    actorName: deciderName,
    courseTitle,
    outcome,
    note,
    href: `/courses/${courseSlug}`,
    sentAt,
  };
  const forOtherAdmins = platformAdminIdsExcept(db, deciderId)
    .filter((recipientId) => recipientId !== buyerId)
    .map((recipientId) => ({
      recipientId,
      kind: NotificationKind.RefundRequestDecidedByOther,
      actorName: deciderName,
      courseTitle,
      outcome,
      href: "/admin/refunds",
      sentAt,
    }));

  const rows = buyerId === deciderId ? forOtherAdmins : [forBuyer, ...forOtherAdmins];
  if (rows.length === 0) return;

  db.insert(notifications).values(rows).run();
}

/**
 * The Team Admin who bought the Team Licence hears about each Seat claimed,
 * unless they claimed it themselves.
 */
export function sendSeatClaimed(
  db: Queryable,
  teamAdminId: number,
  studentId: number,
  studentName: string,
  courseTitle: string,
  now: Date
) {
  if (teamAdminId === studentId) return;

  db.insert(notifications)
    .values({
      recipientId: teamAdminId,
      kind: NotificationKind.SeatClaimed,
      actorName: studentName,
      courseTitle,
      href: "/team",
      sentAt: now.toISOString(),
    })
    .run();
}

/** The course's Instructor hears about a new Question, never its text. */
export function sendQuestionAsked(
  db: Queryable,
  instructorId: number,
  authorName: string,
  courseTitle: string,
  lessonTitle: string,
  now: Date
) {
  db.insert(notifications)
    .values({
      recipientId: instructorId,
      kind: NotificationKind.QuestionAsked,
      actorName: authorName,
      courseTitle,
      lessonTitle,
      href: "/instructor/questions",
      sentAt: now.toISOString(),
    })
    .run();
}

/**
 * The Question's author hears about an Answer, plus the Instructor when a
 * Platform Admin wrote it. The caller picks them; never the Answer's text.
 */
export function sendQuestionAnswered(
  db: Queryable,
  recipientIds: number[],
  answererName: string,
  courseTitle: string,
  lessonTitle: string,
  href: string,
  now: Date
) {
  if (recipientIds.length === 0) return;

  db.insert(notifications)
    .values(
      recipientIds.map((recipientId) => ({
        recipientId,
        kind: NotificationKind.QuestionAnswered,
        actorName: answererName,
        courseTitle,
        lessonTitle,
        href,
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
    case NotificationKind.RefundRequestDecided:
      return `Your refund on ${notification.courseTitle} was ${notification.outcome}`;
    case NotificationKind.RefundRequestDecidedByOther:
      return `${notification.actorName} ${notification.outcome} the refund on ${notification.courseTitle}`;
    case NotificationKind.SeatClaimed:
      return `${notification.actorName} claimed a seat on ${notification.courseTitle}`;
    case NotificationKind.QuestionAsked:
      return `${notification.actorName} asked a question on ${notification.lessonTitle} in ${notification.courseTitle}`;
    case NotificationKind.QuestionAnswered:
      return `${notification.actorName} answered a question on ${notification.lessonTitle} in ${notification.courseTitle}`;
  }
}

function secondLineOf(notification: Notification): string | null {
  return notification.kind === NotificationKind.RefundRequestDecided
    ? notification.note
    : null;
}

function timeAgo(sentAtIso: string, now: Date): string {
  const minutes = Math.floor(
    (now.getTime() - new Date(sentAtIso).getTime()) / 60_000
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / (60 * 24))}d ago`;
}

export type InboxGroup = "today" | "earlier";

function groupOf(sentAtIso: string, now: Date): InboxGroup {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return new Date(sentAtIso) >= midnight ? "today" : "earlier";
}

export type InboxTab = "unread" | "all";

export type InboxItem = {
  id: number;
  kind: NotificationKind;
  text: string;
  // Shown small and grey under the text, cut off if long.
  secondLine: string | null;
  outcome: RefundStatus.Approved | RefundStatus.Declined | null;
  href: string;
  sentAt: string;
  timeAgo: string;
  group: InboxGroup;
  isRead: boolean;
};

const ALL_TAB_LIMIT = 50;

/**
 * One tab of a person's inbox, newest first, ready to show. Unread shows every
 * unread item so nothing unread is hidden; All shows the newest 50.
 */
export function listInbox(
  db: Queryable,
  userId: number,
  tab: InboxTab,
  now: Date
): InboxItem[] {
  const query = db
    .select()
    .from(notifications)
    .where(
      tab === "unread"
        ? and(eq(notifications.recipientId, userId), isNull(notifications.readAt))
        : eq(notifications.recipientId, userId)
    )
    .orderBy(desc(notifications.sentAt), desc(notifications.id));
  const rows = tab === "all" ? query.limit(ALL_TAB_LIMIT).all() : query.all();

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    text: textOf(row),
    secondLine: secondLineOf(row),
    outcome: row.outcome,
    href: row.href,
    sentAt: row.sentAt,
    timeAgo: timeAgo(row.sentAt, now),
    group: groupOf(row.sentAt, now),
    isRead: row.readAt !== null,
  }));
}

// ─── Reading ───

/**
 * Marks one of the person's own notifications read and returns the page it
 * opens. Null when it isn't theirs, so nobody can read another's inbox.
 */
export function markRead(
  db: Queryable,
  userId: number,
  notificationId: number,
  now: Date
): { href: string } | null {
  const own = and(
    eq(notifications.id, notificationId),
    eq(notifications.recipientId, userId)
  );
  const notification = db.select().from(notifications).where(own).get();
  if (!notification) return null;

  db.update(notifications)
    .set({ readAt: now.toISOString() })
    .where(and(own, isNull(notifications.readAt)))
    .run();

  return { href: notification.href };
}

/**
 * Marks the person's unread items read, up to and including the newest one
 * their panel was showing. Anything sent after it stays unread, because they
 * haven't seen it yet. Does nothing when that item isn't theirs.
 */
export function markAllReadUpTo(
  db: Queryable,
  userId: number,
  newestShownId: number,
  now: Date
) {
  const newestShown = db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.id, newestShownId),
        eq(notifications.recipientId, userId)
      )
    )
    .get();
  if (!newestShown) return;

  db.update(notifications)
    .set({ readAt: now.toISOString() })
    .where(
      and(
        eq(notifications.recipientId, userId),
        isNull(notifications.readAt),
        or(
          lt(notifications.sentAt, newestShown.sentAt),
          and(
            eq(notifications.sentAt, newestShown.sentAt),
            lte(notifications.id, newestShown.id)
          )
        )
      )
    )
    .run();
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

// ─── Clean-up ───

const KEEP_DAYS = 90;

/** Removes every notification sent more than 90 days before now, read or not. */
export function deleteOldNotifications(db: Db, now: Date) {
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60_000);
  db.delete(notifications)
    .where(lt(notifications.sentAt, cutoff.toISOString()))
    .run();
}
