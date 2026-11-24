import { data, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.notifications.$id.read";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { parseParams } from "~/lib/validation";
import { markRead } from "~/lib/notifications.server";

const paramsSchema = z.object({
  id: z.coerce.number().int(),
});

export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  const { id } = parseParams(params, paramsSchema);
  const opened = markRead(db, currentUserId, id, new Date());

  if (!opened) {
    throw data("Notification not found.", { status: 404 });
  }

  // The hover "mark as read" button clears an item without opening it.
  const formData = await request.formData();
  if (formData.get("intent") === "mark-read") {
    return { ok: true };
  }

  return redirect(opened.href);
}
