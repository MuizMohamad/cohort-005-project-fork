import { eq } from "drizzle-orm";
import type { Db, Queryable } from "~/db";
import {
  comments,
  courses,
  lessons,
  modules,
  users,
  UserRole,
} from "~/db/schema";
import { MAX_COMMENT_LENGTH, MIN_COMMENT_LENGTH } from "~/lib/comments";
import {
  sendQuestionAnswered,
  sendQuestionAsked,
} from "~/lib/notifications.server";

// ─── Comments ───
// Posting a comment or reply on a lesson, and telling the right people when it
// is a Question or an Answer (see GLOSSARY.md). Editing and deleting still
// live in the lesson route and send nothing.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention).

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

export function getCommentById(db: Queryable, commentId: number) {
  return db.select().from(comments).where(eq(comments.id, commentId)).get();
}

function getUserById(db: Queryable, userId: number) {
  return db.select().from(users).where(eq(users.id, userId)).get();
}

/**
 * The course's Instructor and Platform Admins: their replies to a Question are
 * Answers, and their top-level comments are never Questions.
 */
function canAnswer(user: { id: number; role: UserRole }, instructorId: number) {
  return user.id === instructorId || user.role === UserRole.Admin;
}

export function getCourseForLesson(db: Queryable, lessonId: number) {
  return db
    .select({
      courseId: courses.id,
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

    const parent = parentId === null ? null : getCommentById(tx, parentId);
    if (parentId !== null) {
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
    const authorCanAnswer = canAnswer(author, course.instructorId);

    if (!parent) {
      if (!authorCanAnswer) {
        sendQuestionAsked(tx, { authorId: userId, lessonId }, now);
      }
      return comment;
    }

    const questionAuthor = getUserById(tx, parent.userId);
    const isAnswer =
      authorCanAnswer &&
      questionAuthor !== undefined &&
      !canAnswer(questionAuthor, course.instructorId);
    if (isAnswer) {
      sendQuestionAnswered(
        tx,
        { questionAuthorId: questionAuthor.id, answererId: userId, lessonId },
        now
      );
    }

    return comment;
  });
}
