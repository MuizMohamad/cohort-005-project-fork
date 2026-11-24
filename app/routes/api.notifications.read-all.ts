import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.notifications.read-all";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { parseFormData } from "~/lib/validation";
import { markAllReadUpTo } from "~/lib/notifications.server";

const markAllSchema = z.object({
  upTo: z.coerce.number().int(),
});

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  const parsed = parseFormData(await request.formData(), markAllSchema);

  if (!parsed.success) {
    throw data("Missing the newest notification shown.", { status: 400 });
  }

  markAllReadUpTo(db, currentUserId, parsed.data.upTo, new Date());

  return { ok: true };
}
