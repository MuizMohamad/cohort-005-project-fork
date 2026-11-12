import { useEffect } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import type { Route } from "./+types/admin.refunds";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import {
  UserRole,
  RefundStatus,
  refunds,
  purchases,
  courses,
  enrollments,
  users,
} from "~/db/schema";
import { db } from "~/db";
import { and, eq, isNull } from "drizzle-orm";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { AlertTriangle, ReceiptText } from "lucide-react";
import { data, isRouteErrorResponse, Link } from "react-router";
import { formatPrice } from "~/lib/utils";

const adminRefundActionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("approve"),
    refundId: z.coerce.number().int(),
  }),
  z.object({
    intent: z.literal("decline"),
    refundId: z.coerce.number().int(),
  }),
]);

function getUserById(id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

function getOpenRefundRequests() {
  return db
    .select({
      refundId: refunds.id,
      reason: refunds.reason,
      requestedAt: refunds.requestedAt,
      amountPaid: purchases.amountPaid,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      learnerName: users.name,
      learnerEmail: users.email,
      purchaseId: purchases.id,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .where(eq(refunds.status, RefundStatus.Open))
    .all();
}

function approveRefundRequest(
  refundId: number,
  amountPaid: number,
  resolvedByUserId: number,
  learnerId: number,
  courseId: number
) {
  const now = new Date().toISOString();
  db.update(refunds)
    .set({
      status: RefundStatus.Approved,
      amountRefunded: amountPaid,
      resolvedAt: now,
      resolvedByUserId,
    })
    .where(
      and(eq(refunds.id, refundId), eq(refunds.status, RefundStatus.Open))
    )
    .run();

  // Soft-revoke the enrollment so the learner loses access immediately.
  // revokedAt stays set even if the Refund later fails — ops can clear it
  // manually if they need to restore access while retrying the payment.
  db.update(enrollments)
    .set({ revokedAt: now })
    .where(
      and(
        eq(enrollments.userId, learnerId),
        eq(enrollments.courseId, courseId),
        isNull(enrollments.revokedAt)
      )
    )
    .run();
}

function declineRefundRequest(refundId: number, resolvedByUserId: number) {
  return db
    .update(refunds)
    .set({
      status: RefundStatus.Declined,
      resolvedAt: new Date().toISOString(),
      resolvedByUserId,
    })
    .where(
      and(eq(refunds.id, refundId), eq(refunds.status, RefundStatus.Open))
    )
    .returning()
    .get();
}

function buildApprovedEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
}) {
  return {
    to: input.learnerEmail,
    subject: `Your refund has been approved — ${input.courseTitle}`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `Your refund request for "${input.courseTitle}" has been approved.`,
      `${formatPrice(input.amount)} will be returned to your original payment method.`,
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

function buildDeclinedEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
}) {
  return {
    to: input.learnerEmail,
    subject: `Your refund request was not approved — ${input.courseTitle}`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `We were not able to approve your refund request for "${input.courseTitle}".`,
      "If you have questions, please reply to this email.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

export function meta() {
  return [
    { title: "Refund Requests — Cadence" },
    { name: "description", content: "Review and action open refund requests" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to manage refund requests.", {
      status: 401,
    });
  }

  const currentUser = getUserById(currentUserId);

  if (!currentUser || currentUser.role !== UserRole.Admin) {
    throw data("Only admins can access this page.", { status: 403 });
  }

  return { openRefundRequests: getOpenRefundRequests() };
}

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in.", { status: 401 });
  }

  const currentUser = getUserById(currentUserId);
  if (!currentUser || currentUser.role !== UserRole.Admin) {
    throw data("Only admins can action refund requests.", { status: 403 });
  }

  const formData = await request.formData();
  const parsed = parseFormData(formData, adminRefundActionSchema);

  if (!parsed.success) {
    return data(
      { error: Object.values(parsed.errors)[0] ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { intent, refundId } = parsed.data;

  // Look up the refund + purchase + learner + course for the email stub.
  const row = db
    .select({
      amountPaid: purchases.amountPaid,
      courseTitle: courses.title,
      courseId: courses.id,
      learnerId: users.id,
      learnerName: users.name,
      learnerEmail: users.email,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .where(
      and(eq(refunds.id, refundId), eq(refunds.status, RefundStatus.Open))
    )
    .get();

  if (!row) {
    return data({ error: "Refund Request not found or already resolved." }, { status: 404 });
  }

  if (intent === "approve") {
    approveRefundRequest(refundId, row.amountPaid, currentUserId, row.learnerId, row.courseId);
    const email = buildApprovedEmail({ ...row, amount: row.amountPaid });
    console.log(
      `[email] to=${email.to} subject=${email.subject}\n${email.body}`
    );
    return { success: true };
  }

  if (intent === "decline") {
    declineRefundRequest(refundId, currentUserId);
    const email = buildDeclinedEmail(row);
    console.log(
      `[email] to=${email.to} subject=${email.subject}\n${email.body}`
    );
    return { success: true };
  }

  throw data("Invalid action.", { status: 400 });
}

function RefundRequestRow({
  request: req,
}: {
  request: {
    refundId: number;
    reason: string;
    requestedAt: string;
    amountPaid: number;
    courseTitle: string;
    courseSlug: string;
    learnerName: string;
    learnerEmail: string;
  };
}) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error) {
      toast.error(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  const formattedDate = new Date(req.requestedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3">
        <div className="text-sm font-medium">{req.learnerName}</div>
        <div className="text-xs text-muted-foreground">{req.learnerEmail}</div>
      </td>
      <td className="px-4 py-3">
        <Link
          to={`/courses/${req.courseSlug}`}
          className="text-sm font-medium hover:underline"
        >
          {req.courseTitle}
        </Link>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {formatPrice(req.amountPaid)}
      </td>
      <td className="px-4 py-3 max-w-xs">
        <p className="truncate text-sm text-muted-foreground">{req.reason}</p>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {formattedDate}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="approve" />
            <input type="hidden" name="refundId" value={req.refundId} />
            <Button
              type="submit"
              size="sm"
              className="h-7 text-xs"
              disabled={isSubmitting}
            >
              Approve
            </Button>
          </fetcher.Form>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="decline" />
            <input type="hidden" name="refundId" value={req.refundId} />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={isSubmitting}
            >
              Decline
            </Button>
          </fetcher.Form>
        </div>
      </td>
    </tr>
  );
}

function TableRowSkeleton() {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-1 h-3 w-36" />
      </td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-40" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-48" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
      <td className="px-4 py-3"><Skeleton className="h-7 w-32" /></td>
    </tr>
  );
}

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="mb-8">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-2 h-5 w-80" />
      </div>
      <Skeleton className="mb-4 h-5 w-36" />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {["Learner", "Course", "Amount", "Reason", "Requested", "Actions"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 4 }).map((_, i) => (
                  <TableRowSkeleton key={i} />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminRefunds({ loaderData }: Route.ComponentProps) {
  const { openRefundRequests } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Refund Requests</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Refund Requests</h1>
        <p className="mt-1 text-muted-foreground">
          Review and action open refund requests from learners
        </p>
      </div>

      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <ReceiptText className="size-4" />
        <span>
          {openRefundRequests.length} open{" "}
          {openRefundRequests.length === 1 ? "request" : "requests"}
        </span>
      </div>

      {openRefundRequests.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <ReceiptText className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-muted-foreground">No open refund requests.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {["Learner", "Course", "Amount", "Reason", "Requested", "Actions"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {openRefundRequests.map((req) => (
                    <RefundRequestRow key={req.refundId} request={req} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message =
    "An unexpected error occurred while loading refund requests.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "Only admins can access this page.";
    } else {
      title = `Error ${error.status}`;
      message =
        typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
