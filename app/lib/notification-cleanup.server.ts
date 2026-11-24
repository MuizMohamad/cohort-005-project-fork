import type { Db } from "~/db";
import { deleteOldNotifications } from "./notifications.server";

// ─── Notification clean-up job ───
// Cadence's first timed job. Deletes old notifications once at start-up and
// then once a day, inside the server process, apart from any save.

const ONE_DAY = 24 * 60 * 60_000;

/** Starts the clean-up. Returns a function that stops it. */
export function startNotificationCleanup(db: Db): () => void {
  const run = () => {
    try {
      deleteOldNotifications(db, new Date());
    } catch (error) {
      console.error("Notification clean-up failed", error);
    }
  };

  run();
  const timer = setInterval(run, ONE_DAY);
  // Never keep the process alive just for the clean-up.
  timer.unref?.();

  return () => clearInterval(timer);
}
