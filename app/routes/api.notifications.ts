import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.notifications";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { checkInbox } from "~/lib/notifications.server";

const tabSchema = z.enum(["unread", "all"]).nullable();

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  const tab = tabSchema.safeParse(new URL(request.url).searchParams.get("tab"));

  if (!tab.success) {
    throw data("Invalid tab", { status: 400 });
  }

  return Response.json(checkInbox(db, currentUserId, tab.data));
}
