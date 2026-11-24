import { and, eq } from "drizzle-orm";
import { coupons, enrollments } from "~/db/schema";
import { getSeatAvailability, type Db } from "~/lib/refunds.server";

// ─── Seats ───
// A Student claiming a Seat on a Team Licence to get an Enrollment. See
// GLOSSARY.md for the language.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention).

export const SEAT_ON_HOLD =
  "This seat can't be claimed right now. Ask the person who shared it with you.";
export const SEAT_REFUNDED =
  "This seat is no longer available. Ask the person who shared it with you.";

export type ClaimResult =
  | { ok: true; enrollment: typeof enrollments.$inferSelect }
  | { ok: false; error: string };

/**
 * Claims the Seat with this code for a Student, enrolling them in its course.
 * The Seat claim and the Enrollment are saved together or not at all.
 */
export function claimSeat(
  db: Db,
  code: string,
  studentId: number,
  studentCountry: string,
  now: Date
): ClaimResult {
  return db.transaction((tx): ClaimResult => {
    const seat = tx.select().from(coupons).where(eq(coupons.code, code)).get();
    if (!seat) {
      return { ok: false, error: "Coupon not found" };
    }

    if (seat.redeemedByUserId !== null) {
      return { ok: false, error: "Coupon has already been redeemed" };
    }

    const availability = getSeatAvailability(tx, seat);
    if (availability === "on_hold") {
      return { ok: false, error: SEAT_ON_HOLD };
    }
    if (availability === "refunded") {
      return { ok: false, error: SEAT_REFUNDED };
    }

    const existingEnrollment = tx
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, studentId),
          eq(enrollments.courseId, seat.courseId)
        )
      )
      .get();

    if (existingEnrollment) {
      return { ok: false, error: "You are already enrolled in this course" };
    }

    tx.update(coupons)
      .set({ redeemedByUserId: studentId, redeemedAt: now.toISOString() })
      .where(eq(coupons.id, seat.id))
      .run();

    const enrollment = tx
      .insert(enrollments)
      .values({ userId: studentId, courseId: seat.courseId })
      .returning()
      .get();

    return { ok: true, enrollment };
  });
}
