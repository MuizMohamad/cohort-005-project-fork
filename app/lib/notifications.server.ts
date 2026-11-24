import { and, desc, eq, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import type { Db, Queryable } from "~/db";
import {
  courses,
  lessons,
  modules,
  notifications,
  users,
  NotificationKind,
  UserRole,
  type RefundDecision,
} from "~/db/schema";

// ─── Notifications ───
// Each person's in-app inbox. A send function per kind works out who gets it
// (never the person who caused it), copies in the names it needs, and writes
// one row per recipient. The wording is built here when the inbox is listed.
// See docs/specs/in-app-notifications.md.
//
// Every function takes the database first, so tests can hand in an in-memory
// one, and send functions also accept an open transaction so they can join
// the save that caused them. Send functions take the event's ids as one
// object; the rest use positional parameters (project convention).

type Notification = typeof notifications.$inferSelect;

export const ONE_DAY_MS = 24 * 60 * 60_000;

// ─── Where each kind opens ───

export const REFUNDS_REVIEW_HREF = "/admin/refunds";
export const TEAM_HREF = "/team";
export const UNANSWERED_QUESTIONS_HREF = "/instructor/questions";

export function courseHref(courseSlug: string) {
  return `/courses/${courseSlug}`;
}

export function lessonHref(courseSlug: string, lessonId: number) {
  return `/courses/${courseSlug}/lessons/${lessonId}`;
}

// ─── Sending ───

function platformAdminIdsExcept(db: Queryable, userId: number): number[] {
  return db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, UserRole.Admin), ne(users.id, userId)))
    .all()
    .map((row) => row.id);
}

function nameOf(db: Queryable, userId: number) {
  return db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .get()?.name;
}

function getCourse(db: Queryable, courseId: number) {
  return db
    .select({ title: courses.title, slug: courses.slug })
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
}

function getLesson(db: Queryable, lessonId: number) {
  return db
    .select({
      lessonTitle: lessons.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      instructorId: courses.instructorId,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .get();
}

type RefundRequestRaised = { buyerId: number; courseId: number };

/** Every Platform Admin but the buyer hears about a new Refund Request. */
export function sendRefundRequestRaised(
  db: Queryable,
  raised: RefundRequestRaised,
  now: Date
) {
  const buyerName = nameOf(db, raised.buyerId);
  const course = getCourse(db, raised.courseId);
  const recipientIds = platformAdminIdsExcept(db, raised.buyerId);
  if (!buyerName || !course || recipientIds.length === 0) return;

  db.insert(notifications)
    .values(
      recipientIds.map((recipientId) => ({
        recipientId,
        kind: NotificationKind.RefundRequestRaised,
        actorName: buyerName,
        courseTitle: course.title,
        href: REFUNDS_REVIEW_HREF,
        sentAt: now.toISOString(),
      }))
    )
    .run();
}

type RefundRequestDecided = {
  buyerId: number;
  deciderId: number;
  courseId: number;
  outcome: RefundDecision;
  note: string | null;
};

/**
 * The buyer hears the outcome of their Refund Request, with the decision note,
 * and every other Platform Admin hears who decided it. The decider hears
 * nothing, and a buyer who is also a Platform Admin gets only the buyer item.
 */
export function sendRefundRequestDecided(
  db: Queryable,
  decided: RefundRequestDecided,
  now: Date
) {
  const { buyerId, deciderId, outcome, note } = decided;
  const deciderName = nameOf(db, deciderId);
  const course = getCourse(db, decided.courseId);
  if (!deciderName || !course) return;

  const sentAt = now.toISOString();
  const forBuyer = {
    recipientId: buyerId,
    kind: NotificationKind.RefundRequestDecided,
    actorName: deciderName,
    courseTitle: course.title,
    outcome,
    note,
    href: courseHref(course.slug),
    sentAt,
  };
  const forOtherAdmins = platformAdminIdsExcept(db, deciderId)
    .filter((recipientId) => recipientId !== buyerId)
    .map((recipientId) => ({
      recipientId,
      kind: NotificationKind.RefundRequestDecidedByOther,
      actorName: deciderName,
      courseTitle: course.title,
      outcome,
      href: REFUNDS_REVIEW_HREF,
      sentAt,
    }));

  const rows = buyerId === deciderId ? forOtherAdmins : [forBuyer, ...forOtherAdmins];
  if (rows.length === 0) return;

  db.insert(notifications).values(rows).run();
}

type SeatClaimed = {
  teamAdminId: number;
  studentId: number;
  courseId: number;
};

/**
 * The Team Admin who bought the Team Licence hears about each Seat claimed,
 * unless they claimed it themselves.
 */
export function sendSeatClaimed(db: Queryable, claimed: SeatClaimed, now: Date) {
  if (claimed.teamAdminId === claimed.studentId) return;

  const studentName = nameOf(db, claimed.studentId);
  const course = getCourse(db, claimed.courseId);
  if (!studentName || !course) return;

  db.insert(notifications)
    .values({
      recipientId: claimed.teamAdminId,
      kind: NotificationKind.SeatClaimed,
      actorName: studentName,
      courseTitle: course.title,
      href: TEAM_HREF,
      sentAt: now.toISOString(),
    })
    .run();
}

type QuestionAsked = { authorId: number; lessonId: number };

/** The course's Instructor hears about a new Question, never its text. */
export function sendQuestionAsked(
  db: Queryable,
  asked: QuestionAsked,
  now: Date
) {
  const authorName = nameOf(db, asked.authorId);
  const lesson = getLesson(db, asked.lessonId);
  if (!authorName || !lesson) return;

  db.insert(notifications)
    .values({
      recipientId: lesson.instructorId,
      kind: NotificationKind.QuestionAsked,
      actorName: authorName,
      courseTitle: lesson.courseTitle,
      lessonTitle: lesson.lessonTitle,
      href: UNANSWERED_QUESTIONS_HREF,
      sentAt: now.toISOString(),
    })
    .run();
}

type QuestionAnswered = {
  questionAuthorId: number;
  answererId: number;
  lessonId: number;
};

/**
 * The Question's author hears about an Answer, plus the course's Instructor
 * when someone else (a Platform Admin) wrote it. Never the Answer's text.
 */
export function sendQuestionAnswered(
  db: Queryable,
  answered: QuestionAnswered,
  now: Date
) {
  const answererName = nameOf(db, answered.answererId);
  const lesson = getLesson(db, answered.lessonId);
  if (!answererName || !lesson) return;

  const recipientIds =
    answered.answererId === lesson.instructorId
      ? [answered.questionAuthorId]
      : [answered.questionAuthorId, lesson.instructorId];

  db.insert(notifications)
    .values(
      recipientIds.map((recipientId) => ({
        recipientId,
        kind: NotificationKind.QuestionAnswered,
        actorName: answererName,
        courseTitle: lesson.courseTitle,
        lessonTitle: lesson.lessonTitle,
        href: lessonHref(lesson.courseSlug, answered.lessonId),
        sentAt: now.toISOString(),
      }))
    )
    .run();
}

// ─── Showing ───

const TEXT_BY_KIND: Record<NotificationKind, (n: Notification) => string> = {
  [NotificationKind.RefundRequestRaised]: (n) =>
    `${n.actorName} asked for a refund on ${n.courseTitle}`,
  [NotificationKind.RefundRequestDecided]: (n) =>
    `Your refund on ${n.courseTitle} was ${n.outcome}`,
  [NotificationKind.RefundRequestDecidedByOther]: (n) =>
    `${n.actorName} ${n.outcome} the refund on ${n.courseTitle}`,
  [NotificationKind.SeatClaimed]: (n) =>
    `${n.actorName} claimed a seat on ${n.courseTitle}`,
  [NotificationKind.QuestionAsked]: (n) =>
    `${n.actorName} asked a question on ${n.lessonTitle} in ${n.courseTitle}`,
  [NotificationKind.QuestionAnswered]: (n) =>
    `${n.actorName} answered a question on ${n.lessonTitle} in ${n.courseTitle}`,
};

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
  outcome: RefundDecision | null;
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
    text: TEXT_BY_KIND[row.kind](row),
    secondLine: secondLineOf(row),
    outcome: row.outcome,
    href: row.href,
    sentAt: row.sentAt,
    timeAgo: timeAgo(row.sentAt, now),
    group: groupOf(row.sentAt, now),
    isRead: row.readAt !== null,
  }));
}

export type InboxCheck = {
  unreadCount: number;
  tab: InboxTab | null;
  items: InboxItem[] | null;
};

/**
 * What the browser's background check gets: the unread count and, when a tab
 * is asked for (the panel is open on it), that tab of the inbox.
 */
export function checkInbox(
  db: Queryable,
  userId: number,
  tab: InboxTab | null,
  now: Date
): InboxCheck {
  return {
    unreadCount: countUnread(db, userId),
    tab,
    items: tab ? listInbox(db, userId, tab, now) : null,
  };
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
  const isTheirs = and(
    eq(notifications.id, notificationId),
    eq(notifications.recipientId, userId)
  );
  const notification = db.select().from(notifications).where(isTheirs).get();
  if (!notification) return null;

  db.update(notifications)
    .set({ readAt: now.toISOString() })
    .where(and(isTheirs, isNull(notifications.readAt)))
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
  const cutoff = new Date(now.getTime() - KEEP_DAYS * ONE_DAY_MS);
  db.delete(notifications)
    .where(lt(notifications.sentAt, cutoff.toISOString()))
    .run();
}
