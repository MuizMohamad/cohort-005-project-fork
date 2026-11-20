# Which in-app notification services fit Cadence?

Research for [#7](https://github.com/MuizMohamad/cohort-005-project-fork/issues/7), part of map [#6](https://github.com/MuizMohamad/cohort-005-project-fork/issues/6). The final choice is made in the grilling ticket [#9](https://github.com/MuizMohamad/cohort-005-project-fork/issues/9).

All facts below come from each vendor's own docs, pricing pages, or GitHub repos, read on **2026-11-20**. Pricing pages change often, so re-check them before deciding.

## What Cadence needs

Cadence is a React Router 8 app with one SQLite file (ADR 0006). It already sends email through Postmark in `app/lib/mailer.server.ts`. That file picks a transport at runtime: Postmark when `POSTMARK_SERVER_TOKEN` is set, otherwise it writes each email as a JSON file into `.outbox/`. That "no real service in dev and tests" pattern is the bar any notification service has to meet.

For each service we checked:

1. Is there a ready-made React inbox, and how much can we change it?
2. How does read/unread state work?
3. How are users identified, and how is the browser's access to a user's inbox secured?
4. Price and free tier.
5. Can it send email too, and how does that overlap with Postmark?
6. How do we run without the real service in local dev and tests?

## Knock

**React inbox.** `@knocklabs/react` ships `NotificationIconButton` (the bell) and `NotificationFeedPopover` / `NotificationFeed` (the list). You can replace each row with `renderItem`, swap the avatar, override CSS variables prefixed `--rnf-`, or drop Knock's CSS entirely. There is a dark mode prop and an `i18n` prop for your own strings. Real-time updates come over a socket. ([React feed docs](https://docs.knock.app/in-app-ui/react/feed))

**Read/unread.** Each message has separate "engagement statuses" that can stack: `seen` (shown in the feed), `read`, `interacted` (clicked), `link_clicked`, and `archived`, each with a timestamp such as `read_at`. By default the popover marks items *seen* when it opens, not *read*; the badge can count either. Knock's React SDK manages these for you. ([Message statuses](https://docs.knock.app/send-notifications/message-statuses), [React feed docs](https://docs.knock.app/in-app-ui/react/feed))

**User identity and security.** You pass your own user ID (`user={{ id: user.id }}`). By default, the public API key can act as *any* user. Before launch you turn on "enhanced security mode". Then your server must sign a JWT with Knock's RS256 private key (`sub` = user ID, plus `iat`/`exp`) and pass it to the browser as `userToken`. The Node SDK has `signUserToken()` for this. Tokens can also carry narrow "grants" that limit what the browser may do. ([Security and authentication](https://docs.knock.app/in-app-ui/security-and-authentication))

**Pricing.** Free: $0, up to 10,000 messages a month, with Knock branding on the feed. Starter: $250 a month, 50,000 messages, then $0.005 each, branding removed. A "message" is one message to one user on one channel, so an in-app message *plus* an email for the same event counts as **two**. Knock does not hard-stop you at the free limit. ([Pricing](https://knock.app/pricing))

**Email overlap.** Knock does not deliver email itself. It routes through a provider you connect, and it has a first-class Postmark integration (delivery tracking, bounces, per-environment config, sandbox mode). Knock's FAQ confirms you still pay Postmark separately. So Knock could *replace* our direct Postmark calls, but it would not replace Postmark. ([Postmark integration](https://docs.knock.app/integrations/email/postmark), [Pricing FAQ](https://knock.app/pricing))

**Local dev and tests.** There is no local emulator; Knock is hosted only. What it offers:

- A separate **development environment** with its own API keys and data. ([Environments](https://docs.knock.app/concepts/environments))
- **Sandbox mode** on a channel, where messages are processed but marked "not sent" instead of going to the provider. ([Message statuses](https://docs.knock.app/send-notifications/message-statuses))
- Enhanced security can be left off in development. ([Security and authentication](https://docs.knock.app/in-app-ui/security-and-authentication))

Automated tests would still need our own fake (see "Running without the real service" below).

## Novu

**React inbox.** `@novu/react` ships an `<Inbox />` built from smaller parts: `Bell`, `Notifications`, `InboxContent`, and `Preferences`. You can override styles, replace any part or icon, and it includes tabs, filters, localisation, snoozing and a preferences screen. There is also a full **headless** mode (`useNotifications`, `useCounts`, `useNovu`) if you want to draw every pixel yourself. Requires React 18 or 19. ([Inbox overview](https://docs.novu.co/platform/inbox/overview), [Headless mode](https://docs.novu.co/platform/inbox/headless/api-reference))

**Read/unread.** Each notification has `isRead`, `isSeen` and `isArchived`. You call `novu.notifications.read(...)` or `.archive(...)`, and `useCounts` can return unread or unseen counts live over a websocket. ([Headless mode](https://docs.novu.co/platform/inbox/headless/api-reference))

**User identity and security.** Users are "subscribers" with your own `subscriberId`. The browser also gets a public `applicationIdentifier`. Novu warns that without extra security someone could guess another `subscriberId` and read their notifications. The fix is HMAC mode: your server computes `HMAC-SHA256(secretKey, subscriberId)` as a hex string (plain Node `crypto`, no SDK needed) and passes it as `subscriberHash`. Once HMAC is on, the inbox will not load without it. ([Prepare for production](https://docs.novu.co/platform/inbox/prepare-for-production))

Note the difference from Knock: an HMAC hash never expires, while Knock and Courier tokens carry an expiry.

**Pricing.** Free: $0, 10,000 "workflow runs" a month, up to 5 workflows, 2 environments (dev + prod), 24-hour activity log, Novu branding. Pro: from $30 a month, 30,000+ runs, branding removed. Team: from $250 a month. Novu bills per workflow *run*, not per channel message, so one event that sends in-app and email is one run. ([Pricing](https://novu.co/pricing))

**Email overlap.** Novu routes email through a provider you connect, and Postmark is supported (server token + verified sender). ([Postmark integration](https://docs.novu.co/platform/integrations/email/postmark))

**Local dev and tests.** Novu is the only one here you can run yourself. A Docker Compose "community" setup starts the API, worker, websocket service and dashboard on `localhost:4000`. ([Deploy with Docker](https://docs.novu.co/community/self-hosting-novu/deploy-with-docker)) It is heavy, though: it needs MongoDB, Redis and S3-style storage, and the single-machine guide suggests 4 vCPUs and 8 GB RAM for the Novu services alone. ([Self-hosting overview](https://docs.novu.co/community/self-hosting-novu/overview)) That is a lot for a SQLite app's test suite. Licence: most of the repo is MIT, but the `enterprise/` packages are under a proprietary licence. ([LICENSE-ENTERPRISE](https://github.com/novuhq/novu/blob/next/LICENSE-ENTERPRISE))

## Courier

**React inbox.** `@trycourier/courier-react` (v9, React 18+) ships `<CourierInbox />`, plus toasts and a preferences centre that share one sign-in. The older `@trycourier/react-inbox` packages are deprecated. You can theme light and dark mode (`CourierInboxTheme`), handle clicks and action buttons, pick which header and message actions appear, replace parts of the UI, or build a fully custom UI on the SDK's data. Tabs can filter by tag, read state, archive state or date. ([Inbox overview](https://www.courier.com/docs/platform/inbox/inbox-overview), [Customise the inbox](https://www.courier.com/docs/in-app/customize-the-inbox.md), [Docs index](https://www.courier.com/docs/llms.txt))

**Read/unread.** Messages can be read, opened and archived, and these states sync live across all of a user's devices. Messages are kept for 1 year. A neat detail: if the same template goes to email *and* the inbox, opening the email (with open tracking on) marks the inbox copy as read. ([Inbox runtime behaviour](https://www.courier.com/docs/in-app/how-the-inbox-behaves.md), [Inbox overview](https://www.courier.com/docs/platform/inbox/inbox-overview))

**User identity and security.** You use your own user ID; nothing needs to exist in Courier first. Your server calls Courier's `POST /auth/issue-token` with your secret key and a scope string such as `user_id:<id> inbox:read:messages inbox:write:events`, and passes the JWT to `signIn({ userId, jwt })` in the browser. Courier stresses two things: read the user ID from your own session (never from the request), and always set `expires_in`, because a token without it never expires. Unlike Knock, this is a **network call** to Courier per token, not a local signature. The SDKs do not refresh tokens for you. ([Authenticate users](https://www.courier.com/docs/platform/inbox/authentication))

**Pricing.** Developer: free, 10,000 sends a month. Business: $0.005 per send, *including* the first 10,000 (so 50,000 sends = $250). A "send" is one template to one recipient no matter how many channels, so in-app + email = **one** send. Sends from Test environments count too. ([Pricing](https://www.courier.com/pricing))

**Email overlap.** Courier has a Postmark integration and says plainly: keep Postmark, Courier sends through your account, and Postmark bills you separately. ([Postmark integration](https://www.courier.com/docs/integrations/email/postmark.md))

**Local dev and tests.** No local emulator. Each workspace has several environments with their own keys, and the docs say to start with "Test". A Test key works with no email provider connected. Test sends still count toward billing. ([Docs index](https://www.courier.com/docs/llms.txt), [Pricing](https://www.courier.com/pricing))

## MagicBell

**React inbox.** `@magicbell/react` ships a `ContextProvider`, `FloatingInbox` (bell + panel) and `Inbox`, plus a preferences component, toasts and web-push buttons. You can swap the bell button (`ButtonComponent`), the inbox, or each row (`ItemComponent`), and restyle with `--magicbell-*` CSS variables and class names. ([React components](https://www.magicbell.com/docs/libraries/magicbell-react))

**Read/unread.** The inbox supports read/unread, archive and delete, with real-time updates. The docs we read do not describe a separate "seen" state. ([In-app channel](https://www.magicbell.com/docs/channels/in_app))

**User identity and security.** Your server signs an HS256 JWT with the project's secret key. The payload holds `user_external_id` (your user ID) and/or `user_email`, plus the project's `api_key`. The browser passes it as `token` to the provider. Note that the docs' own example sets `expiresIn: '1y'`, so pick a shorter expiry yourself. ([User JWT](https://www.magicbell.com/docs/api/authentication/user))

**Pricing.** Builder: $0, 1,000 deliveries a month, 1 project. Startup: $249 a month, 50,000 deliveries, then $0.0025 each. Like Knock, each channel counts as a separate delivery. The free tier is the smallest of the group. ([Pricing](https://www.magicbell.com/pricing))

**Email overlap.** MagicBell's docs list email providers Mailgun, SendGrid, Amazon SES and a generic SMTP option. There is **no dedicated Postmark integration**. Postmark would have to go through the SMTP option; we did not check Postmark's SMTP settings for this. ([SMTP provider](https://www.magicbell.com/docs/channels/email/smtp), [docs sitemap](https://www.magicbell.com/sitemap.xml))

**Local dev and tests.** No local emulator or sandbox mode found in the docs we read. Projects are the unit of separation (1 on the free plan).

## Also worth a look: SuprSend

SuprSend is a smaller player with a similar shape. Its current React SDK is `@suprsend/react`, with drop-in and headless inbox options, and it has moved inbox auth from HMAC to signed JWT user tokens. ([React inbox](https://docs.suprsend.com/docs/inbox-react)) Free: 10,000 notifications a month with SuprSend branding; Essentials: $100 a month billed yearly. Each channel counts separately. You bring your own email provider. ([Pricing](https://www.suprsend.com/pricing)) We did not check whether it has a dedicated Postmark integration.

## Running without the real service (all vendors)

None of the hosted services can run inside our test process. Only Novu can run locally at all, and it needs Docker, MongoDB and Redis. So whichever we pick, the safest path is to copy the pattern `mailer.server.ts` already uses:

1. Put a small interface in front of the vendor on the server, for example a `NotificationTransport` with a `notify(userId, notification)` method.
2. Have a real implementation that calls the vendor when its secret key is set.
3. Have a fake that writes to SQLite or memory when the key is missing, so tests can check "user X got notification Y" without any network.

The harder part is the **browser**. Every vendor's React inbox talks straight to the vendor's servers over a websocket, so with no key the ready-made component has nothing to show. Options for dev and tests:

- Hide the bell when no key is set.
- Or render our own simple list from the fake's data (this is easiest with a vendor that has headless hooks, like Novu or Knock, because our fake can match the same shape).

We did **not** check how each React component behaves under server-side rendering in React Router 8. Expect to render it on the client only.

## Comparison

Pricing is as published on 2026-11-20.

| | Knock | Novu | Courier | MagicBell | SuprSend |
| --- | --- | --- | --- | --- | --- |
| React inbox | Yes, `@knocklabs/react` | Yes, `@novu/react` | Yes, `@trycourier/courier-react` | Yes, `@magicbell/react` | Yes, `@suprsend/react` |
| Headless / custom UI | Yes (hooks, `renderItem`) | Yes (full headless hooks) | Yes (custom renderers, JS SDK) | Partly (custom item and button) | Yes |
| States | seen, read, interacted, archived | seen, read, archived, snooze | read, opened, archived | read, archived, deleted | not checked |
| Browser auth | RS256 JWT signed locally | HMAC of user ID (no expiry) | JWT from Courier API call, scoped | HS256 JWT signed locally | Signed JWT |
| Free tier | 10k messages/mo | 10k workflow runs/mo | 10k sends/mo | 1k deliveries/mo | 10k notifications/mo |
| In-app + email for one event | 2 messages | 1 run | 1 send | 2 deliveries | 2 notifications |
| First paid step | $250/mo | $30/mo | $0.005/send | $249/mo | $100/mo (yearly) |
| Remove branding | Paid | Paid | not checked | not checked | Paid |
| Postmark integration | Yes | Yes | Yes | No (SMTP only) | not checked |
| Local run | No (dev env + sandbox) | Yes, Docker (heavy) | No (Test env) | No | No |

## Recommendation (input for #9, not the final decision)

**Leaning: Knock, with Novu as the close second.** The choice is made in [#9](https://github.com/MuizMohamad/cohort-005-project-fork/issues/9).

- **Knock** fits best on security and testing. Its user tokens are signed on our server with no network call and carry an expiry. It has a clean dev environment and a per-channel sandbox mode. It has a first-class Postmark integration. Its free tier (10,000 messages) is plenty for a course app at this stage. Downsides: the first paid tier is $250 a month, and in-app plus email counts as two messages.
- **Novu** is cheapest to grow on ($30 a month, and it bills per run, not per channel). It has the richest headless hooks and is the only one you can self-host. Downsides: HMAC hashes never expire, and the free plan caps you at 5 workflows and 24 hours of logs.
- **Courier** is a fair third. Its per-send pricing is simple and in-app + email counts once. But every inbox token needs a round trip to Courier, and test sends are billed.
- **MagicBell** is the weakest fit: the smallest free tier (1,000) and no Postmark integration.

Whichever we choose, keep Postmark and `mailer.server.ts` as they are at first, and add the in-app service behind its own small interface with a local fake. Moving email into the vendor's workflows can be a later, separate decision.
