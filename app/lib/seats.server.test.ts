import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { approveRefundRequest, raiseRefundRequest } from "./refunds.server";
import { claimSeat } from "./seats.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let teamAdmin: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  teamAdmin = addUser("Tara");
});

function addUser(name: string) {
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

function buySeat(country: string | null = "AU") {
  const team = db.insert(schema.teams).values({}).returning().get();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId: teamAdmin.id,
      courseId: base.course.id,
      amountPaid: 7900,
      country,
      createdAt: NOW.toISOString(),
    })
    .returning()
    .get();
  return db
    .insert(schema.coupons)
    .values({
      teamId: team.id,
      courseId: base.course.id,
      code: `SEAT-${purchase.id}`,
      purchaseId: purchase.id,
    })
    .returning()
    .get();
}

describe("claimSeat", () => {
  it("enrolls the Student in the Seat's course", () => {
    const seat = buySeat();
    const student = addUser("Sam");

    const result = claimSeat(db, seat.code, student.id, "AU", NOW);

    expect(result).toEqual({
      ok: true,
      enrollment: expect.objectContaining({
        userId: student.id,
        courseId: base.course.id,
      }),
    });
  });

  it("refuses a code that matches no Seat", () => {
    const student = addUser("Sam");

    expect(claimSeat(db, "NO-SUCH-SEAT", student.id, "AU", NOW)).toEqual({
      ok: false,
      error: "Coupon not found",
    });
  });

  it("refuses a Seat someone has already claimed", () => {
    const seat = buySeat();
    claimSeat(db, seat.code, addUser("Sam").id, "AU", NOW);

    expect(claimSeat(db, seat.code, addUser("Kim").id, "AU", NOW)).toEqual({
      ok: false,
      error: "Coupon has already been redeemed",
    });
  });

  it("refuses a Seat on hold while its Team Licence has an Open Refund Request", () => {
    const seat = buySeat();
    raiseRefundRequest(db, seat.purchaseId, teamAdmin.id, "Not needed", NOW);

    expect(claimSeat(db, seat.code, addUser("Sam").id, "AU", NOW)).toEqual({
      ok: false,
      error:
        "This seat can't be claimed right now. Ask the person who shared it with you.",
    });
  });

  it("refuses a Seat whose Team Licence was refunded", () => {
    const seat = buySeat();
    const raised = raiseRefundRequest(
      db,
      seat.purchaseId,
      teamAdmin.id,
      "Not needed",
      NOW
    );
    if (!raised.ok) throw new Error(raised.error);
    const platformAdmin = db
      .insert(schema.users)
      .values({ name: "Pat", email: "pat@example.com", role: UserRole.Admin })
      .returning()
      .get();
    approveRefundRequest(db, raised.refundRequestId, platformAdmin.id, null, NOW);

    expect(claimSeat(db, seat.code, addUser("Sam").id, "AU", NOW)).toEqual({
      ok: false,
      error:
        "This seat is no longer available. Ask the person who shared it with you.",
    });
  });

  it("refuses a Student already enrolled in the course and leaves the Seat unclaimed", () => {
    const student = addUser("Sam");
    claimSeat(db, buySeat().code, student.id, "AU", NOW);
    const secondSeat = buySeat();

    expect(claimSeat(db, secondSeat.code, student.id, "AU", NOW)).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
    expect(
      claimSeat(db, secondSeat.code, addUser("Kim").id, "AU", NOW).ok
    ).toBe(true);
  });
});
