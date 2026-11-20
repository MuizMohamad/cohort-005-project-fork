// PROTOTYPE: "What does the inbox look like, and where does it sit?"
// Three variants of the notification bell + inbox, mounted in the real app
// layout and switchable via `?variant=A|B|C`. Fake, in-memory notifications
// only (read state resets on reload). Never merge to main.
import { useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  CheckCircle2,
  Inbox,
  MessageSquare,
  Receipt,
  Reply,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { UserRole } from "~/db/schema";

// ─── Fake data ────────────────────────────────────────────────────────────────

type Kind =
  | "refund-raised"
  | "refund-decided"
  | "seat-claimed"
  | "question-asked"
  | "question-answered";

interface FakeNotification {
  id: number;
  kind: Kind;
  actor: string;
  title: string;
  detail?: string;
  href: string;
  minutesAgo: number;
  outcome?: "approved" | "declined";
}

const kindLabel: Record<Kind, string> = {
  "refund-raised": "Refund Request raised",
  "refund-decided": "Refund Request decided",
  "seat-claimed": "Seat claimed",
  "question-asked": "Question asked",
  "question-answered": "Question answered",
};

function fakeNotificationsFor(
  role: UserRole | null,
  isTeamAdmin: boolean
): FakeNotification[] {
  const list: Omit<FakeNotification, "id">[] = [];

  if (role === UserRole.Admin) {
    list.push(
      {
        kind: "refund-raised",
        actor: "Sam Lee",
        title: "Sam Lee asked for a refund on Intro to TypeScript",
        href: "/admin/refunds",
        minutesAgo: 4,
      },
      {
        kind: "refund-decided",
        actor: "Alex Chen",
        title: "Alex Chen approved a refund on React Patterns",
        href: "/admin/refunds",
        minutesAgo: 52,
        outcome: "approved",
      },
      {
        kind: "refund-raised",
        actor: "Maria Gomez",
        title: "Maria Gomez asked for a refund on Node in Production",
        href: "/admin/refunds",
        minutesAgo: 60 * 5,
      },
      {
        kind: "refund-decided",
        actor: "Alex Chen",
        title: "Alex Chen declined a refund on Intro to TypeScript",
        href: "/admin/refunds",
        minutesAgo: 60 * 30,
        outcome: "declined",
      }
    );
  }

  if (role === UserRole.Instructor) {
    list.push(
      {
        kind: "question-asked",
        actor: "Jo Park",
        title: "Jo Park asked a question on “Generics” in Intro to TypeScript",
        href: "/instructor/questions",
        minutesAgo: 2,
      },
      {
        kind: "question-asked",
        actor: "Lena Fischer",
        title:
          "Lena Fischer asked a question on “Narrowing” in Intro to TypeScript",
        href: "/instructor/questions",
        minutesAgo: 35,
      },
      {
        kind: "question-answered",
        actor: "Alex Chen",
        title:
          "Alex Chen answered a question on “Type guards” in Intro to TypeScript",
        detail: "A Platform Admin answered on your course",
        href: "/courses",
        minutesAgo: 60 * 3,
      },
      {
        kind: "question-asked",
        actor: "Omar Haddad",
        title: "Omar Haddad asked a question on “Setup” in Intro to TypeScript",
        href: "/instructor/questions",
        minutesAgo: 60 * 26,
      }
    );
  }

  if (role === UserRole.Student) {
    list.push(
      {
        kind: "question-answered",
        actor: "Dr. Kim",
        title:
          "Dr. Kim answered your question on “Generics” in Intro to TypeScript",
        href: "/courses",
        minutesAgo: 8,
      },
      {
        kind: "refund-decided",
        actor: "Cadence",
        title: "Your refund for React Patterns was approved",
        detail: "Note: Sorry the course wasn't a fit. Refund is on its way.",
        href: "/courses",
        minutesAgo: 60 * 2,
        outcome: "approved",
      },
      {
        kind: "refund-decided",
        actor: "Cadence",
        title: "Your refund for Node in Production was declined",
        detail: "Note: Over 80% of the course has been completed.",
        href: "/courses",
        minutesAgo: 60 * 50,
        outcome: "declined",
      }
    );
  }

  if (isTeamAdmin) {
    list.push(
      {
        kind: "seat-claimed",
        actor: "Priya Shah",
        title: "Priya Shah claimed a Seat on Intro to TypeScript",
        href: "/team",
        minutesAgo: 15,
      },
      {
        kind: "seat-claimed",
        actor: "Tom Wu",
        title: "Tom Wu claimed a Seat on Intro to TypeScript",
        href: "/team",
        minutesAgo: 60 * 28,
      }
    );
  }

  return list
    .sort((a, b) => a.minutesAgo - b.minutesAgo)
    .map((n, i) => ({ ...n, id: i + 1 }));
}

function ago(minutes: number) {
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / (60 * 24))}d ago`;
}

function KindIcon({
  n,
  className,
}: {
  n: FakeNotification;
  className?: string;
}) {
  const cls = cn("size-4", className);
  switch (n.kind) {
    case "refund-raised":
      return <Receipt className={cls} />;
    case "refund-decided":
      return n.outcome === "declined" ? (
        <XCircle className={cn(cls, "text-red-600")} />
      ) : (
        <CheckCircle2 className={cn(cls, "text-green-600")} />
      );
    case "seat-claimed":
      return <UserPlus className={cls} />;
    case "question-asked":
      return <MessageSquare className={cls} />;
    case "question-answered":
      return <Reply className={cls} />;
  }
}

function useFakeInbox(role: UserRole | null, isTeamAdmin: boolean) {
  const items = fakeNotificationsFor(role, isTeamAdmin);
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  // Pretend anything older than a day was already read.
  const isRead = (id: number) =>
    readIds.has(id) ||
    (items.find((n) => n.id === id)?.minutesAgo ?? 0) > 60 * 24;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const variant = searchParams.get("variant");
  const unread = items.filter((n) => !isRead(n.id)).length;

  return {
    items,
    unread,
    isRead,
    markRead: (id: number) => setReadIds((s) => new Set(s).add(id)),
    markAllRead: () => setReadIds(new Set(items.map((n) => n.id))),
    open: (n: FakeNotification) => {
      setReadIds((s) => new Set(s).add(n.id));
      navigate(variant ? `${n.href}?variant=${variant}` : n.href);
    },
  };
}

type Inbox = ReturnType<typeof useFakeInbox>;

function CountBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white",
        className
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
      <Inbox className="size-8 opacity-40" />
      Nothing here yet.
    </div>
  );
}

// ─── Variant A: bell in the sidebar header, compact popover ──────────────────

function VariantABell({ inbox }: { inbox: Inbox }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative ml-auto rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        aria-label="Notifications"
      >
        <Bell className="size-4" />
        <CountBadge count={inbox.unread} className="absolute -right-1 -top-1" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed left-[13.5rem] top-3 z-50 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="text-sm font-semibold">Notifications</span>
              <button
                onClick={inbox.markAllRead}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Mark all as read
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {inbox.items.length === 0 && <EmptyState />}
              {inbox.items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    inbox.open(n);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 border-b px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-accent",
                    inbox.isRead(n.id) && "text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      inbox.isRead(n.id) ? "bg-transparent" : "bg-blue-600"
                    )}
                  />
                  <span className="flex-1">{n.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {ago(n.minutesAgo)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ─── Variant B: "Inbox" nav item, right-hand drawer with rich cards ──────────

function VariantBNavItem({
  inbox,
  onOpen,
}: {
  inbox: Inbox;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Bell className="size-4" />
      Inbox
      <CountBadge count={inbox.unread} className="ml-auto" />
    </button>
  );
}

function VariantBDrawer({
  inbox,
  onClose,
}: {
  inbox: Inbox;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const shown = inbox.items.filter((n) => tab === "all" || !inbox.isRead(n.id));
  const today = shown.filter((n) => n.minutesAgo < 60 * 24);
  const earlier = shown.filter((n) => n.minutesAgo >= 60 * 24);

  function Group({
    label,
    items,
  }: {
    label: string;
    items: FakeNotification[];
  }) {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="space-y-2 px-3">
          {items.map((n) => (
            <div
              key={n.id}
              className={cn(
                "group relative flex gap-3 rounded-lg border p-3",
                !inbox.isRead(n.id) &&
                  "border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30"
              )}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <KindIcon n={n} />
              </div>
              <button
                onClick={() => {
                  inbox.open(n);
                  onClose();
                }}
                className="flex-1 text-left"
              >
                <div className="text-xs text-muted-foreground">
                  {kindLabel[n.kind]} · {ago(n.minutesAgo)}
                </div>
                <div className="text-sm font-medium">{n.title}</div>
                {n.detail && (
                  <div className="mt-1 text-sm text-muted-foreground">
                    {n.detail}
                  </div>
                )}
              </button>
              {!inbox.isRead(n.id) && (
                <button
                  onClick={() => inbox.markRead(n.id)}
                  title="Mark as read"
                  className="self-start rounded p-1 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100"
                >
                  <CheckCheck className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-[28rem] flex-col border-l bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold">Inbox</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted">
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
              {t === "unread" && ` (${inbox.unread})`}
            </button>
          ))}
          <button
            onClick={inbox.markAllRead}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            Mark all as read
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-6">
          {shown.length === 0 && <EmptyState />}
          <Group label="Today" items={today} />
          <Group label="Earlier" items={earlier} />
        </div>
      </aside>
    </>
  );
}

// ─── Variant C: top bar with bell, full-page inbox in the main area ──────────

function VariantCTopBar({
  inbox,
  onOpen,
}: {
  inbox: Inbox;
  onOpen: () => void;
}) {
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center justify-end gap-2 border-b bg-background/90 px-6 backdrop-blur">
      <button
        onClick={onOpen}
        className="relative flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-muted"
      >
        <Bell className="size-4" />
        {inbox.unread > 0 ? `${inbox.unread} new` : "Notifications"}
      </button>
    </div>
  );
}

function VariantCPage({
  inbox,
  onClose,
}: {
  inbox: Inbox;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<Kind | "all">("all");
  const kinds = Array.from(new Set(inbox.items.map((n) => n.kind)));
  const shown = inbox.items.filter(
    (n) => filter === "all" || n.kind === filter
  );

  return (
    <div className="mx-auto max-w-5xl p-6">
      <button
        onClick={onClose}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back
      </button>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {inbox.unread} unread of {inbox.items.length}
          </p>
        </div>
        <button
          onClick={inbox.markAllRead}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Mark all as read
        </button>
      </div>
      <div className="flex gap-6">
        <nav className="hidden w-48 shrink-0 space-y-1 lg:block">
          {(["all", ...kinds] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm",
                filter === k
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover:bg-muted/60"
              )}
            >
              {k === "all" ? "Everything" : kindLabel[k]}
              <span className="text-xs">
                {k === "all"
                  ? inbox.items.length
                  : inbox.items.filter((n) => n.kind === k).length}
              </span>
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 text-sm">
          <div className="grid grid-cols-[1.5rem_1fr_4.5rem] gap-3 border-b py-2 lg:grid-cols-[1.5rem_1fr_9rem_4.5rem] text-xs uppercase tracking-wider text-muted-foreground">
            <span />
            <span>Message</span>
            <span className="hidden lg:block">Kind</span>
            <span className="text-right">When</span>
          </div>
          {shown.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                inbox.open(n);
                onClose();
              }}
              className={cn(
                "grid w-full grid-cols-[1.5rem_1fr_4.5rem] items-start lg:grid-cols-[1.5rem_1fr_9rem_4.5rem] gap-3 border-b py-3 text-left hover:bg-muted/50",
                !inbox.isRead(n.id) && "font-semibold"
              )}
            >
              <KindIcon n={n} className="mt-0.5" />
              <span>
                {n.title}
                {n.detail && (
                  <span className="block font-normal text-muted-foreground">
                    {n.detail}
                  </span>
                )}
              </span>
              <span className="hidden font-normal text-muted-foreground lg:block">
                {kindLabel[n.kind]}
              </span>
              <span className="text-right font-normal text-muted-foreground">
                {ago(n.minutesAgo)}
              </span>
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 && <EmptyState />}
    </div>
  );
}

// ─── Wiring: slots the layout drops into place ───────────────────────────────

export const notificationVariants = [
  { key: "A", name: "Sidebar bell + popover" },
  { key: "B", name: "Inbox nav item + drawer" },
  { key: "C", name: "Top bar + full page" },
];

interface Slots {
  sidebarHeader?: ReactNode;
  sidebarNavTop?: ReactNode;
  mainTop?: ReactNode;
  mainOverride?: ReactNode;
  overlay?: ReactNode;
}

export function useNotificationPrototype(
  variant: string,
  role: UserRole | null,
  isTeamAdmin: boolean
): Slots {
  const inbox = useFakeInbox(role, isTeamAdmin);
  const [open, setOpen] = useState(false);

  if (!role) return {};

  if (variant === "B") {
    return {
      sidebarNavTop: (
        <VariantBNavItem inbox={inbox} onOpen={() => setOpen(true)} />
      ),
      overlay: open ? (
        <VariantBDrawer inbox={inbox} onClose={() => setOpen(false)} />
      ) : undefined,
    };
  }

  if (variant === "C") {
    return {
      mainTop: <VariantCTopBar inbox={inbox} onOpen={() => setOpen(true)} />,
      mainOverride: open ? (
        <VariantCPage inbox={inbox} onClose={() => setOpen(false)} />
      ) : undefined,
    };
  }

  return { sidebarHeader: <VariantABell inbox={inbox} /> };
}
