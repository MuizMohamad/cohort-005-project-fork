import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { postComment } from "./comments.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let moduleId: number;
let lessonId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  moduleId = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get().id;

  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId, title: "Lesson 1", position: 1 })
    .returning()
    .get().id;
});

describe("postComment", () => {
  it("posts a top-level comment with the body trimmed", () => {
    const comment = postComment(
      db,
      base.user.id,
      lessonId,
      null,
      "  How do I start?  "
    );

    expect(comment).toMatchObject({
      userId: base.user.id,
      lessonId,
      parentId: null,
      body: "How do I start?",
    });
  });

  it("rejects a body that is only whitespace", () => {
    expect(() =>
      postComment(db, base.user.id, lessonId, null, "   \n  ")
    ).toThrow("Comment cannot be empty");
  });

  it("rejects a body longer than 5000 characters", () => {
    expect(() =>
      postComment(db, base.user.id, lessonId, null, "a".repeat(5001))
    ).toThrow("Comment must be 5000 characters or fewer");
  });

  it("accepts a body of exactly 5000 characters", () => {
    const comment = postComment(
      db,
      base.user.id,
      lessonId,
      null,
      "a".repeat(5000)
    );

    expect(comment.body).toHaveLength(5000);
  });

  it("rejects a comment on a lesson that does not exist", () => {
    expect(() =>
      postComment(db, base.user.id, 9999, null, "Hello?")
    ).toThrow("Lesson not found");
  });

  describe("replies", () => {
    it("posts a reply under a top-level comment", () => {
      const question = postComment(db, base.user.id, lessonId, null, "Why?");

      const reply = postComment(
        db,
        base.instructor.id,
        lessonId,
        question.id,
        "Because."
      );

      expect(reply).toMatchObject({
        userId: base.instructor.id,
        lessonId,
        parentId: question.id,
        body: "Because.",
      });
    });

    it("rejects a reply to a comment that does not exist", () => {
      expect(() =>
        postComment(db, base.instructor.id, lessonId, 9999, "Because.")
      ).toThrow("Parent comment not found");
    });

    it("rejects a reply whose parent is on a different lesson", () => {
      const otherLessonId = db
        .insert(schema.lessons)
        .values({ moduleId, title: "Lesson 2", position: 2 })
        .returning()
        .get().id;
      const elsewhere = postComment(
        db,
        base.user.id,
        otherLessonId,
        null,
        "Over here"
      );

      expect(() =>
        postComment(db, base.instructor.id, lessonId, elsewhere.id, "Hi")
      ).toThrow("Parent comment belongs to a different lesson");
    });

    it("rejects a reply to a reply, keeping threads one level deep", () => {
      const question = postComment(db, base.user.id, lessonId, null, "Why?");
      const reply = postComment(
        db,
        base.instructor.id,
        lessonId,
        question.id,
        "Because."
      );

      expect(() =>
        postComment(db, base.user.id, lessonId, reply.id, "But why?")
      ).toThrow("Replies can only be one level deep");
    });
  });
});
