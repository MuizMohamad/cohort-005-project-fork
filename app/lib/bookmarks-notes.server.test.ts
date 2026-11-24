import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { approveRefundRequest, raiseRefundRequest } from "./refunds.server";
import { fakeNotifications } from "./notifications.fake.server";
import {
  isBookmarked,
  listBookmarks,
  toggleBookmark,
} from "./bookmarks.server";
import { getNote, listNotes, MAX_NOTE_LENGTH, saveNote } from "./notes.server";

type TestDb = ReturnType<typeof createTestDb>;

const T1 = new Date(2026, 9, 6, 12, 0, 0);
const T2 = new Date(2026, 9, 6, 13, 0, 0);
const T3 = new Date(2026, 9, 6, 14, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

describe("bookmarking a Lesson", () => {
  it("creates a Bookmark, and toggling again removes it", () => {
    expect(toggleBookmark(db, base.user.id, lessonIds[0])).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);

    expect(toggleBookmark(db, base.user.id, lessonIds[0])).toBe(false);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(false);
  });

  it("never leaves a Student with two Bookmarks on a Lesson", () => {
    toggleBookmark(db, base.user.id, lessonIds[0]);
    expect(() =>
      db
        .insert(schema.bookmarks)
        .values({ userId: base.user.id, lessonId: lessonIds[0] })
        .run()
    ).toThrow();
  });

  it("keeps one Student's Bookmark separate from another's", () => {
    const other = addStudent("Other");
    toggleBookmark(db, base.user.id, lessonIds[0]);

    expect(isBookmarked(db, other.id, lessonIds[0])).toBe(false);
  });
});

describe("saving a Note", () => {
  it("creates a Note, with the body trimmed", () => {
    const result = saveNote(db, base.user.id, lessonIds[0], "  hello  ", T1);

    expect(result).toEqual({ ok: true });
    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "hello",
      updatedAt: T1.toISOString(),
    });
  });

  it("replaces the body and moves the last edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "first", T1);
    saveNote(db, base.user.id, lessonIds[0], "second", T2);

    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "second",
      updatedAt: T2.toISOString(),
    });
    const rows = db.select().from(schema.notes).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].createdAt).toBe(T1.toISOString());
  });

  it("clears the Note when the body is empty", () => {
    saveNote(db, base.user.id, lessonIds[0], "first", T1);
    saveNote(db, base.user.id, lessonIds[0], "   ", T2);

    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });

  it("refuses a Note over the cap and keeps the old one", () => {
    saveNote(db, base.user.id, lessonIds[0], "first", T1);
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "x".repeat(MAX_NOTE_LENGTH + 1),
      T2
    );

    expect(result.ok).toBe(false);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("first");
  });

  it("accepts a Note of exactly the cap", () => {
    const body = "x".repeat(MAX_NOTE_LENGTH);

    expect(saveNote(db, base.user.id, lessonIds[0], body, T1)).toEqual({
      ok: true,
    });
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(body);
  });
});

describe("the Saved lists", () => {
  it("holds only the Student's own rows, newest first, with Lesson and Course", () => {
    const other = addStudent("Other");
    toggleBookmark(db, other.id, lessonIds[0]);
    saveNote(db, other.id, lessonIds[0], "not mine", T3);

    db.insert(schema.bookmarks)
      .values({
        userId: base.user.id,
        lessonId: lessonIds[0],
        createdAt: T1.toISOString(),
      })
      .run();
    db.insert(schema.bookmarks)
      .values({
        userId: base.user.id,
        lessonId: lessonIds[1],
        createdAt: T2.toISOString(),
      })
      .run();
    saveNote(db, base.user.id, lessonIds[0], "older", T1);
    saveNote(db, base.user.id, lessonIds[1], "newer", T2);

    expect(listBookmarks(db, base.user.id)).toMatchObject([
      { lessonId: lessonIds[1], lessonTitle: "Lesson 2", courseTitle: "Test Course", courseSlug: "test-course" },
      { lessonId: lessonIds[0], lessonTitle: "Lesson 1", courseTitle: "Test Course", courseSlug: "test-course" },
    ]);
    expect(listNotes(db, base.user.id)).toMatchObject([
      { body: "newer", lessonId: lessonIds[1], courseSlug: "test-course" },
      { body: "older", lessonId: lessonIds[0], courseSlug: "test-course" },
    ]);
  });

  it("orders Notes by last edited time, not creation time", () => {
    saveNote(db, base.user.id, lessonIds[0], "a", T1);
    saveNote(db, base.user.id, lessonIds[1], "b", T2);
    saveNote(db, base.user.id, lessonIds[0], "a edited", T3);

    expect(listNotes(db, base.user.id).map((n) => n.body)).toEqual([
      "a edited",
      "b",
    ]);
  });
});

describe("approving a Refund", () => {
  it("keeps the Student's Bookmarks and Notes", async () => {
    const notifications = fakeNotifications();
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 7900,
        createdAt: new Date(T1.getTime() - 3 * 86_400_000).toISOString(),
      })
      .returning()
      .get();
    db.insert(schema.enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .run();
    const admin = db
      .insert(schema.users)
      .values({ name: "Pat", email: "pat@example.com", role: UserRole.Admin })
      .returning()
      .get();
    toggleBookmark(db, base.user.id, lessonIds[0]);
    saveNote(db, base.user.id, lessonIds[0], "keep me", T1);

    const raised = await raiseRefundRequest(
      db,
      purchase.id,
      base.user.id,
      "Not what I expected.",
      T1,
      notifications
    );
    if (!raised.ok) throw new Error(raised.error);
    await approveRefundRequest(
      db,
      raised.refundRequestId,
      admin.id,
      null,
      T1,
      notifications
    );

    expect(
      db
        .select()
        .from(schema.enrollments)
        .where(eq(schema.enrollments.userId, base.user.id))
        .all()
    ).toHaveLength(0);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("keep me");
  });
});
