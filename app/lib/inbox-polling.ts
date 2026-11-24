import type { InboxCheck, InboxItem, InboxTab } from "./notifications.server";

// ─── Inbox polling ───
// Keeps the bell fresh in the browser without a live connection. Runs in the
// browser, so it only imports types from the server module.
// See docs/specs/in-app-notifications.md, "Serving the inbox to the browser".

export const CHECK_INTERVAL_MS = 60_000;

export type CheckOutcome =
  | { status: "ok"; check: InboxCheck }
  | { status: "signed-out" }
  | { status: "failed" };

export interface Page {
  isHidden(): boolean;
  onVisibilityChange(listener: () => void): () => void;
}

/**
 * Checks every 60 seconds while the page is visible, pauses while it is
 * hidden, and checks at once when it comes back. A failed check is ignored
 * (the next one runs 60 seconds later); a signed-out answer stops the checks.
 */
export function startInboxPolling(
  check: () => Promise<CheckOutcome>,
  onCheck: (check: InboxCheck) => void,
  page: Page
): { checkNow: () => void; stop: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function scheduleNext() {
    clearTimeout(timer);
    if (!stopped && !page.isHidden()) {
      timer = setTimeout(runCheck, CHECK_INTERVAL_MS);
    }
  }

  async function runCheck() {
    clearTimeout(timer);
    if (stopped) return;
    const outcome = await check().catch((): CheckOutcome => ({ status: "failed" }));
    if (stopped) return;
    if (outcome.status === "signed-out") return stop();
    if (outcome.status === "ok") onCheck(outcome.check);
    scheduleNext();
  }

  const stopListening = page.onVisibilityChange(() => {
    if (page.isHidden()) clearTimeout(timer);
    else runCheck();
  });

  function stop() {
    stopped = true;
    clearTimeout(timer);
    stopListening();
  }

  scheduleNext();

  return { checkNow: runCheck, stop };
}

export async function fetchInboxCheck(
  tab: InboxTab | null
): Promise<CheckOutcome> {
  const response = await fetch(
    tab ? `/api/notifications?tab=${tab}` : "/api/notifications"
  );
  if (response.status === 401) return { status: "signed-out" };
  if (!response.ok) return { status: "failed" };
  return { status: "ok", check: await response.json() };
}

export const documentPage: Page = {
  isHidden: () => document.visibilityState === "hidden",
  onVisibilityChange(listener) {
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
};

/**
 * The newest item across the panel's lists, by send time then id (the order
 * "mark all read" uses). A check only refreshes the open tab, so the other
 * tab's list can be older than what is showing.
 */
export function newestItem(...lists: InboxItem[][]): InboxItem | undefined {
  return lists
    .map((list) => list[0])
    .filter((item) => item !== undefined)
    .reduce<InboxItem | undefined>(
      (newest, item) =>
        !newest ||
        item.sentAt > newest.sentAt ||
        (item.sentAt === newest.sentAt && item.id > newest.id)
          ? item
          : newest,
      undefined
    );
}

/**
 * Folds a check's list into the list the panel is showing. New items go on
 * top; items already showing keep their place (with fresh details) and never
 * vanish, so nothing jumps under the mouse.
 */
export function mergeInboxItems(
  showing: InboxItem[],
  fresh: InboxItem[]
): InboxItem[] {
  const showingIds = new Set(showing.map((item) => item.id));
  const freshById = new Map(fresh.map((item) => [item.id, item]));

  return [
    ...fresh.filter((item) => !showingIds.has(item.id)),
    ...showing.map((item) => freshById.get(item.id) ?? item),
  ];
}
