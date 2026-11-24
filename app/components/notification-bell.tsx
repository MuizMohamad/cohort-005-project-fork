import { Form } from "react-router";
import { useState } from "react";
import {
  Bell,
  CircleCheck,
  CircleX,
  Inbox as InboxIcon,
  Receipt,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { NotificationKind, RefundStatus } from "~/db/schema";
import type { InboxItem, InboxTab } from "~/lib/notifications.server";

export interface Inbox {
  unreadCount: number;
  unread: InboxItem[];
  all: InboxItem[];
}

function KindIcon({
  kind,
  outcome,
}: {
  kind: NotificationKind;
  outcome: InboxItem["outcome"];
}) {
  switch (kind) {
    case NotificationKind.RefundRequestRaised:
      return <Receipt className="size-4 shrink-0 text-muted-foreground" />;
    case NotificationKind.RefundRequestDecided:
    case NotificationKind.RefundRequestDecidedByOther:
      return outcome === RefundStatus.Approved ? (
        <CircleCheck className="size-4 shrink-0 text-green-600" />
      ) : (
        <CircleX className="size-4 shrink-0 text-red-600" />
      );
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

function NotificationRow({
  item,
  onOpen,
}: {
  item: InboxItem;
  onOpen: () => void;
}) {
  return (
    <Form
      method="post"
      action={`/api/notifications/${item.id}/read`}
      onSubmit={onOpen}
    >
      <button
        type="submit"
        className={cn(
          "flex w-full items-center gap-3 border-b px-5 py-3 text-left text-sm hover:bg-muted/60",
          item.isRead
            ? "text-muted-foreground"
            : "bg-blue-50/60 font-medium dark:bg-blue-950/30"
        )}
      >
        <KindIcon kind={item.kind} outcome={item.outcome} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">{item.text}</span>
          {item.secondLine && (
            <span className="truncate text-xs font-normal text-muted-foreground">
              {item.secondLine}
            </span>
          )}
        </span>
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
        </div>
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
              <InboxIcon className="size-8 opacity-40" />
              Nothing here yet.
            </div>
          ) : (
            items.map((item) => (
              <NotificationRow key={item.id} item={item} onOpen={onClose} />
            ))
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
