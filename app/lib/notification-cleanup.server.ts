import type { Db } from "~/db";
import { deleteOldNotifications, ONE_DAY_MS } from "./notifications.server";

// ─── Notification clean-up job ───
// Cadence's first timed job. Deletes old notifications once at start-up and
// then once a day, inside the server process, apart from any save.

export function startNotificationCleanup(db: Db) {
  const run = () => {
    try {
      deleteOldNotifications(db, new Date());
    } catch (error) {
      console.error("Notification clean-up failed", error);
    }
  };

  run();
  const timer = setInterval(run, ONE_DAY_MS);
  // Never keep the process alive just for the clean-up.
  timer.unref?.();
}
