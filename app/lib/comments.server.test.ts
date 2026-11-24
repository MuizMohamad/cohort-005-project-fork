import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { postComment } from "./comments.server";
import { listInbox } from "./notifications.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

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
      "  How do I start?  ",
      NOW
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
      postComment(db, base.user.id, lessonId, null, "   \n  ", NOW)
    ).toThrow("Comment cannot be empty");
  });

  it("rejects a body longer than 5000 characters", () => {
    expect(() =>
      postComment(db, base.user.id, lessonId, null, "a".repeat(5001), NOW)
    ).toThrow("Comment must be 5000 characters or fewer");
  });

  it("accepts a body of exactly 5000 characters", () => {
    const comment = postComment(
      db,
      base.user.id,
      lessonId,
      null,
      "a".repeat(5000),
      NOW
    );

    expect(comment.body).toHaveLength(5000);
  });

  it("rejects a comment on a lesson that does not exist", () => {
    expect(() =>
      postComment(db, base.user.id, 9999, null, "Hello?", NOW)
    ).toThrow("Lesson not found");
  });

  describe("replies", () => {
    it("posts a reply under a top-level comment", () => {
      const question = postComment(
        db,
        base.user.id,
        lessonId,
        null,
        "Why?",
        NOW
      );

      const reply = postComment(
        db,
        base.instructor.id,
        lessonId,
        question.id,
        "Because.",
        NOW
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
        postComment(db, base.instructor.id, lessonId, 9999, "Because.", NOW)
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
        "Over here",
        NOW
      );

      expect(() =>
        postComment(db, base.instructor.id, lessonId, elsewhere.id, "Hi", NOW)
      ).toThrow("Parent comment belongs to a different lesson");
    });

    it("rejects a reply to a reply, keeping threads one level deep", () => {
      const question = postComment(
        db,
        base.user.id,
        lessonId,
        null,
        "Why?",
        NOW
      );
      const reply = postComment(
        db,
        base.instructor.id,
        lessonId,
        question.id,
        "Because.",
        NOW
      );

      expect(() =>
        postComment(db, base.user.id, lessonId, reply.id, "But why?", NOW)
      ).toThrow("Replies can only be one level deep");
    });
  });

  describe("notifications", () => {
    let platformAdmin: typeof schema.users.$inferSelect;

    beforeEach(() => {
      platformAdmin = db
        .insert(schema.users)
        .values({
          name: "Pat Admin",
          email: "pat@example.com",
          role: schema.UserRole.Admin,
        })
        .returning()
        .get();
    });

    function inbox(userId: number) {
      return listInbox(db, userId, "all", NOW).map(({ text, href }) => ({
        text,
        href,
      }));
    }

    it("tells the Instructor about a Question, and nobody else", () => {
      postComment(db, base.user.id, lessonId, null, "How do I start?", NOW);

      expect(inbox(base.instructor.id)).toEqual([
        {
          text: "Test User asked a question on Lesson 1 in Test Course",
          href: "/instructor/questions",
        },
      ]);
      expect(inbox(base.user.id)).toEqual([]);
      expect(inbox(platformAdmin.id)).toEqual([]);
    });

    it("sends nothing for a top-level comment by the Instructor or a Platform Admin", () => {
      postComment(db, base.instructor.id, lessonId, null, "Welcome!", NOW);
      postComment(db, platformAdmin.id, lessonId, null, "Hello all", NOW);

      expect(inbox(base.instructor.id)).toEqual([]);
      expect(inbox(platformAdmin.id)).toEqual([]);
      expect(inbox(base.user.id)).toEqual([]);
    });

    it("tells only the Question's author when the Instructor answers it", () => {
      const question = postComment(
        db,
        base.user.id,
        lessonId,
        null,
        "Why?",
        NOW
      );

      postComment(
        db,
        base.instructor.id,
        lessonId,
        question.id,
        "Because.",
        NOW
      );

      expect(inbox(base.user.id)).toEqual([
        {
          text: "Test Instructor answered a question on Lesson 1 in Test Course",
          href: `/courses/test-course/lessons/${lessonId}`,
        },
      ]);
      expect(inbox(base.instructor.id)).toHaveLength(1);
      expect(inbox(platformAdmin.id)).toEqual([]);
    });

    it("tells the author and the Instructor when a Platform Admin answers", () => {
      const question = postComment(
        db,
        base.user.id,
        lessonId,
        null,
        "Why?",
        NOW
      );

      postComment(db, platformAdmin.id, lessonId, question.id, "Hi!", NOW);

      const answered = {
        text: "Pat Admin answered a question on Lesson 1 in Test Course",
        href: `/courses/test-course/lessons/${lessonId}`,
      };
      expect(inbox(base.user.id)).toEqual([answered]);
      expect(inbox(base.instructor.id)).toContainEqual(answered);
      expect(inbox(platformAdmin.id)).toEqual([]);
    });
  });
});
