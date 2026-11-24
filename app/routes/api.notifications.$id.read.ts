import { data, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.notifications.$id.read";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { parseFormData, parseParams } from "~/lib/validation";
import { markRead } from "~/lib/notifications.server";

const paramsSchema = z.object({
  id: z.coerce.number().int(),
});

// The hover "mark as read" button clears an item without opening it.
const readSchema = z.object({
  intent: z.literal("mark-read").optional(),
});

export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  const { id } = parseParams(params, paramsSchema);
  const parsed = parseFormData(await request.formData(), readSchema);

  if (!parsed.success) {
    throw data("Invalid intent.", { status: 400 });
  }

  const opened = markRead(db, currentUserId, id, new Date());

  if (!opened) {
    throw data("Notification not found.", { status: 404 });
  }

  if (parsed.data.intent === "mark-read") {
    return { ok: true };
  }

  return redirect(opened.href);
}
