import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  comments,
  courses,
  lessons,
  modules,
  users,
  UserRole,
} from "~/db/schema";
import { MAX_COMMENT_LENGTH, MIN_COMMENT_LENGTH } from "~/lib/comments";
import { sendQuestionAsked } from "~/lib/notifications.server";

// ─── Comments ───
// Posting a comment or reply on a lesson, and telling the right people when it
// is a Question or an Answer (see GLOSSARY.md). Editing and deleting still
// live in the lesson route and send nothing.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention).

export type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

/** Trims a comment body, throwing if it is empty or too long. */
export function checkCommentBody(body: string) {
  const trimmed = body.trim();
  if (trimmed.length < MIN_COMMENT_LENGTH) {
    throw new Error("Comment cannot be empty");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(
      `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`
    );
  }
  return trimmed;
}

function getCommentById(db: Queryable, commentId: number) {
  return db.select().from(comments).where(eq(comments.id, commentId)).get();
}

function getUserById(db: Queryable, userId: number) {
  return db.select().from(users).where(eq(users.id, userId)).get();
}

function getCourseForLesson(db: Queryable, lessonId: number) {
  return db
    .select({
      courseTitle: courses.title,
      instructorId: courses.instructorId,
      lessonTitle: lessons.title,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .get();
}

/**
 * Posts a top-level comment (parentId null) or a reply on a lesson.
 * Throws an Error with a user-facing message when the post is not allowed.
 */
export function postComment(
  db: Db,
  userId: number,
  lessonId: number,
  parentId: number | null,
  body: string,
  now: Date
) {
  const trimmed = checkCommentBody(body);

  return db.transaction((tx) => {
    const course = getCourseForLesson(tx, lessonId);
    if (!course) {
      throw new Error("Lesson not found");
    }

    if (parentId !== null) {
      const parent = getCommentById(tx, parentId);
      if (!parent) {
        throw new Error("Parent comment not found");
      }
      if (parent.lessonId !== lessonId) {
        throw new Error("Parent comment belongs to a different lesson");
      }
      if (parent.parentId !== null) {
        throw new Error("Replies can only be one level deep");
      }
    }

    const comment = tx
      .insert(comments)
      .values({ userId, lessonId, parentId, body: trimmed })
      .returning()
      .get();

    const author = getUserById(tx, userId);
    if (!author) {
      throw new Error("User not found");
    }
    const isStaff =
      userId === course.instructorId || author.role === UserRole.Admin;

    if (parentId === null && !isStaff) {
      sendQuestionAsked(
        tx,
        course.instructorId,
        author.name,
        course.courseTitle,
        course.lessonTitle,
        now
      );
    }

    return comment;
  });
}
