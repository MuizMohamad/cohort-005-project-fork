# Soft-revoke enrollment when a Refund Request is approved

When an admin approves a Refund Request, we set `enrollments.revoked_at` to the
current timestamp rather than deleting the enrollment row. `findEnrollment` in
`access.server.ts` filters `WHERE revoked_at IS NULL`, so a revoked learner loses
access everywhere without any further changes. `lesson_progress` rows are left
untouched so progress resurfaces naturally if the learner re-purchases.

## Considered options

**Hard-delete the enrollment row.** Simpler, no schema change. Rejected because a
Failed Refund — where the Refund Request is approved but the money never arrives —
would leave the learner locked out and unrefunded simultaneously with no clean
recovery path short of manually re-inserting a row.

**Gate on refund status inside `getAccess`.** No schema change to `enrollments`.
Rejected because it spreads refund-awareness into the access layer, makes every
access check carry an extra join, and leaves a semantically misleading "enrolled"
row in the table for someone who no longer has access.

## Consequences

Access is revoked at approval time, not at Refund issuance. A Failed Refund leaves
the learner locked out until ops intervenes (clearing `revoked_at`). This is
preferable to the reverse — where approved-but-failed leaves the learner with both
their money and their access — but it means ops needs a recovery path if payment
fails. That path does not exist yet.
