import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { postComment } from "./comments.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Lesson 1", position: 1 })
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
});
