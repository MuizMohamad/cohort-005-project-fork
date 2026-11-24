import { Form, useFetcher } from "react-router";
import { useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Inbox as InboxIcon,
  Receipt,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { NotificationKind } from "~/db/schema";
import type {
  InboxGroup,
  InboxItem,
  InboxTab,
} from "~/lib/notifications.server";

export interface Inbox {
  unreadCount: number;
  unread: InboxItem[];
  all: InboxItem[];
}

function KindIcon({ kind }: { kind: NotificationKind }) {
  switch (kind) {
    case NotificationKind.RefundRequestRaised:
      return <Receipt className="size-4 shrink-0 text-muted-foreground" />;
    case NotificationKind.SeatClaimed:
      return <UserPlus className="size-4 shrink-0 text-muted-foreground" />;
  }
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white",
        className
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function MarkReadButton({ item }: { item: InboxItem }) {
  const fetcher = useFetcher();
  return (
    <fetcher.Form
      method="post"
      action={`/api/notifications/${item.id}/read`}
      className="absolute inset-y-0 right-3 hidden items-center group-hover:flex group-focus-within:flex"
    >
      <input type="hidden" name="intent" value="mark-read" />
      <button
        type="submit"
        aria-label="Mark as read"
        title="Mark as read"
        className="rounded-md border bg-background p-1 text-muted-foreground shadow-sm hover:text-foreground"
      >
        <Check className="size-3.5" />
      </button>
    </fetcher.Form>
  );
}

function NotificationRow({
  item,
  onOpen,
}: {
  item: InboxItem;
  onOpen: () => void;
}) {
  return (
    <div className="group relative border-b">
      <Form
        method="post"
        action={`/api/notifications/${item.id}/read`}
        onSubmit={onOpen}
      >
        <button
          type="submit"
          className={cn(
            "flex w-full items-center gap-3 px-5 py-3 text-left text-sm hover:bg-muted/60",
            item.isRead
              ? "text-muted-foreground"
              : "bg-blue-50/60 font-medium dark:bg-blue-950/30"
          )}
        >
          <KindIcon kind={item.kind} />
          <span className="min-w-0 flex-1 truncate">{item.text}</span>
          <span className="shrink-0 text-xs font-normal text-muted-foreground">
            {item.timeAgo}
          </span>
          <span
            aria-label={item.isRead ? undefined : "Unread"}
            className={cn(
              "size-2 shrink-0 rounded-full",
              item.isRead ? "bg-transparent" : "bg-blue-600"
            )}
          />
        </button>
      </Form>
      {!item.isRead && <MarkReadButton item={item} />}
    </div>
  );
}

const GROUP_HEADINGS: Record<InboxGroup, string> = {
  today: "Today",
  earlier: "Earlier",
};

function GroupedItems({
  items,
  onOpen,
}: {
  items: InboxItem[];
  onOpen: () => void;
}) {
  return (["today", "earlier"] as const).map((group) => {
    const inGroup = items.filter((item) => item.group === group);
    if (inGroup.length === 0) return null;
    return (
      <section key={group}>
        <h3 className="border-b bg-muted/40 px-5 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {GROUP_HEADINGS[group]}
        </h3>
        {inGroup.map((item) => (
          <NotificationRow key={item.id} item={item} onOpen={onOpen} />
        ))}
      </section>
    );
  });
}

const EMPTY_MESSAGES: Record<InboxTab, string> = {
  unread: "You're all caught up.",
  all: "No notifications yet.",
};

function MarkAllReadButton({ newestShownId }: { newestShownId: number }) {
  const fetcher = useFetcher();
  return (
    <fetcher.Form
      method="post"
      action="/api/notifications/read-all"
      className="ml-auto"
    >
      <input type="hidden" name="upTo" value={newestShownId} />
      <button
        type="submit"
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <CheckCheck className="size-3.5" />
        Mark all as read
      </button>
    </fetcher.Form>
  );
}

function NotificationPanel({
  inbox,
  onClose,
}: {
  inbox: Inbox;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<InboxTab>("unread");
  const items = tab === "unread" ? inbox.unread : inbox.all;
  // All holds the newest items of every kind, so its first is the newest shown.
  const newestShown = inbox.all[0];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside
        aria-label="Notifications"
        className="fixed inset-y-0 right-0 z-50 flex w-[28rem] max-w-full flex-col border-l bg-background text-foreground shadow-2xl animate-in slide-in-from-right duration-200"
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold">Notifications</h2>
          <button
            onClick={onClose}
            aria-label="Close notifications"
            className="rounded p-1 hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex items-center gap-1 border-b px-3 py-2">
          {(["unread", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-3 py-1 text-sm capitalize",
                tab === t ? "bg-muted font-medium" : "text-muted-foreground"
              )}
            >
              {t}
              {t === "unread" && ` (${inbox.unreadCount})`}
            </button>
          ))}
          {inbox.unreadCount > 0 && newestShown && (
            <MarkAllReadButton newestShownId={newestShown.id} />
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
              <InboxIcon className="size-8 opacity-40" />
              {EMPTY_MESSAGES[tab]}
            </div>
          ) : (
            <GroupedItems items={items} onOpen={onClose} />
          )}
        </div>
      </aside>
    </>
  );
}

export function NotificationBell({ inbox }: { inbox: Inbox }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Notifications, ${inbox.unreadCount} unread`}
        className="relative ml-auto rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        <CountBadge
          count={inbox.unreadCount}
          className="absolute -right-1 -top-1"
        />
      </button>
      {open && (
        <NotificationPanel inbox={inbox} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
