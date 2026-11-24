// ─── Inbox times ───
// Worked out in the browser, so "Today" starts at the viewer's own midnight,
// not the server's.

export type InboxGroup = "today" | "earlier";

export function groupOf(sentAtIso: string, now: Date): InboxGroup {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return new Date(sentAtIso) >= midnight ? "today" : "earlier";
}

export function timeAgo(sentAtIso: string, now: Date): string {
  const minutes = Math.floor(
    (now.getTime() - new Date(sentAtIso).getTime()) / 60_000
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / (60 * 24))}d ago`;
}
