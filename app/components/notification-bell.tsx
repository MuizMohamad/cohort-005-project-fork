import { Form, useFetcher } from "react-router";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  CircleCheck,
  CircleX,
  Inbox as InboxIcon,
  MessageCircleQuestion,
  MessageCircleReply,
  Receipt,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";
import {
  documentVisibility,
  fetchInboxCheck,
  mergeInboxItems,
  newestItem,
  startInboxPolling,
} from "~/lib/inbox-polling";
import { groupOf, timeAgo, type InboxGroup } from "~/lib/inbox-time";
import { NotificationKind, RefundStatus } from "~/db/schema";
import type { InboxItem, InboxTab } from "~/lib/notifications.server";

/** What the app layout's loader gives the bell on every page load and save. */
export interface Inbox {
  unreadCount: number;
}

type InboxLists = Partial<Record<InboxTab, InboxItem[]>>;

const KIND_ICONS: Record<NotificationKind, LucideIcon> = {
  [NotificationKind.RefundRequestRaised]: Receipt,
  [NotificationKind.RefundRequestDecided]: Receipt,
  [NotificationKind.RefundRequestDecidedByOther]: Receipt,
  [NotificationKind.SeatClaimed]: UserPlus,
  [NotificationKind.QuestionAsked]: MessageCircleQuestion,
  [NotificationKind.QuestionAnswered]: MessageCircleReply,
};

function KindIcon({ item }: { item: InboxItem }) {
  if (item.outcome === RefundStatus.Approved) {
    return <CircleCheck className="size-4 shrink-0 text-green-600" />;
  }
  if (item.outcome === RefundStatus.Declined) {
    return <CircleX className="size-4 shrink-0 text-red-600" />;
  }
  const Icon = KIND_ICONS[item.kind];
  return <Icon className="size-4 shrink-0 text-muted-foreground" />;
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
  timeAgo,
  onOpen,
}: {
  item: InboxItem;
  timeAgo: string;
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
          <KindIcon item={item} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">{item.text}</span>
            {item.secondLine && (
              <span className="truncate text-xs font-normal text-muted-foreground">
                {item.secondLine}
              </span>
            )}
          </span>
          <span className="shrink-0 text-xs font-normal text-muted-foreground">
            {timeAgo}
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
  const now = new Date();
  return (["today", "earlier"] as const).map((group) => {
    const inGroup = items.filter((item) => groupOf(item.sentAt, now) === group);
    if (inGroup.length === 0) return null;
    return (
      <section key={group}>
        <h3 className="border-b bg-muted/40 px-5 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {GROUP_HEADINGS[group]}
        </h3>
        {inGroup.map((item) => (
          <NotificationRow
            key={item.id}
            item={item}
            timeAgo={timeAgo(item.sentAt, now)}
            onOpen={onOpen}
          />
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
  unreadCount,
  lists,
  tab,
  setTab,
  onClose,
}: {
  unreadCount: number;
  lists: InboxLists;
  tab: InboxTab;
  setTab: (tab: InboxTab) => void;
  onClose: () => void;
}) {
  const items = lists[tab];
  const newestShown = items && newestItem(items);

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
              {t === "unread" && ` (${unreadCount})`}
            </button>
          ))}
          {unreadCount > 0 && newestShown && (
            <MarkAllReadButton newestShownId={newestShown.id} />
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {!items ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : items.length === 0 ? (
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

/**
 * The unread count from the layout loader, kept fresh between page loads by
 * the background check. While the panel is open the check also brings the
 * open tab's list, which is merged into what is showing.
 */
function useLiveInbox(inbox: Inbox, openTab: InboxTab | null) {
  const [unreadCount, setUnreadCount] = useState(inbox.unreadCount);
  const [lists, setLists] = useState<InboxLists>({});
  const openTabRef = useRef(openTab);
  const pollingRef = useRef<ReturnType<typeof startInboxPolling>>(null);

  // A page change or save re-runs the layout loader. Take its count, and
  // re-check the open tab so an item just marked read shows as read.
  useEffect(() => {
    setUnreadCount(inbox.unreadCount);
    if (openTabRef.current) pollingRef.current?.checkNow();
  }, [inbox]);

  useEffect(() => {
    openTabRef.current = openTab;
    if (openTab) pollingRef.current?.checkNow();
    else setLists({});
  }, [openTab]);

  useEffect(() => {
    const polling = startInboxPolling(
      () => fetchInboxCheck(openTabRef.current),
      ({ unreadCount, tab, items }) => {
        setUnreadCount(unreadCount);
        if (!tab || !items || !openTabRef.current) return;
        setLists((prev) => ({
          ...prev,
          [tab]: mergeInboxItems(prev[tab] ?? [], items),
        }));
      },
      documentVisibility
    );
    pollingRef.current = polling;
    return polling.stop;
  }, []);

  return { unreadCount, lists };
}

export function NotificationBell({ inbox }: { inbox: Inbox }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<InboxTab>("unread");
  const { unreadCount, lists } = useLiveInbox(inbox, open ? tab : null);

  return (
    <>
      <button
        onClick={() => {
          setTab("unread");
          setOpen(true);
        }}
        aria-label={`Notifications, ${unreadCount} unread`}
        className="relative ml-auto rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        <CountBadge count={unreadCount} className="absolute -right-1 -top-1" />
      </button>
      {open && (
        <NotificationPanel
          unreadCount={unreadCount}
          lists={lists}
          tab={tab}
          setTab={setTab}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
