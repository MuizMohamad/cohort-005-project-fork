# Spec: in-app notifications

Built from the decisions on the map [Wayfinder: in-app notifications spec](https://github.com/MuizMohamad/cohort-005-project-fork/issues/6) and its closed tickets #7 to #14. Terms follow `GLOSSARY.md`.

## Problem Statement

People on Cadence only find out that something needs them, or that something happened to them, by going to look. A Platform Admin has to open the refunds review to see whether a new Refund Request has arrived. A buyer learns that their Refund Request was decided only from an email. A Team Admin can't tell when a Student has claimed one of their Seats without checking the team page. An Instructor has to visit unanswered questions to spot a new Question, and a Student who asked a Question has to keep going back to the lesson to see whether it has an Answer.

So Open Refund Requests wait longer than they need to, Questions sit unanswered, and people lose track of things that matter to them.

## Solution

Cadence gets its own in-app inbox: a bell in the sidebar header with an unread count, which opens a panel listing that person's notifications.

The first version has five kinds of notification: Refund Request raised, Refund Request decided, Seat claimed, Question asked, and Question answered. Each one goes to the people who need to know, never to the person who caused it. Clicking a notification marks it read and opens the page where the person can act on it.

The bell stays fresh without a reload: it updates on every page change and save, about once a minute while the tab is in view, and straight away when the person comes back to the tab. There is no live connection, no toast and no sound.

Cadence stores the inbox in its own SQLite database. No third-party notification service is used. The two refund emails the buyer already gets stay as they are, beside the inbox.

## User Stories

### Refund Request raised

1. As a Platform Admin, I want a notification when a buyer raises a Refund Request, so that I can review it without checking the refunds review page all day.
2. As a Platform Admin, I want that notification to name the course and the buyer, so that I know what it is about before I open it.
3. As a Platform Admin, I want clicking it to open the refunds review, so that I can decide the request straight away.
4. As a Platform Admin, I want every Platform Admin to get it, so that whoever is free first can pick it up.
5. As a buyer, I want no inbox item for a Refund Request I raised myself, so that my inbox isn't filled with things I already know.
6. As a buyer, I want to keep getting the "Refund requested" email, so that I have a record that Cadence received my request and know they will email me again.
7. As a Platform Admin who raises a Refund Request on my own Purchase, I want no inbox item for it, so that I'm not told about my own action.
8. As a buyer, I want the notification not to show my reason, so that what I wrote stays on the refunds review page only.

### Refund Request decided

9. As a buyer, I want a notification when my Refund Request is decided, so that I learn the outcome even if I miss the email.
10. As a buyer, I want it to say whether it was approved or declined and name the course, so that I understand it at a glance.
11. As a buyer, I want the decision note shown as a short grey second line, so that I can see why without opening anything.
12. As a buyer whose approval came with no note, I want no empty second line, so that the item stays clean.
13. As a buyer, I want a green tick for approved and a red cross for declined, so that I can tell the outcome from the icon.
14. As a buyer, I want clicking it to open the course page, so that I can see where I stand with the course.
15. As a buyer, I want to keep getting the decision email with the amount, so that I have the money details in writing.
16. As a Platform Admin, I want a notification when another Platform Admin decides a Refund Request, so that I know it's handled and don't look at it again.
17. As a Platform Admin, I want that notification to say the outcome, the course, and who decided, so that I know who to ask about it.
18. As a Platform Admin, I want clicking it to open the refunds review, so that I can see the full decision.
19. As the Platform Admin who decided a request, I want no notification about my own decision, so that I'm not told what I just did.
20. As a Platform Admin who is also the buyer, I want only the buyer notification, so that I don't get two items for one event.

### Seat claimed

21. As a Team Admin, I want a notification each time a Student claims a Seat on my Team Licence, so that I can follow who has joined.
22. As a Team Admin, I want it to name the Student and the course, so that I know who claimed which Seat.
23. As a Team Admin, I want clicking it to open the team page, so that I can see all my Seats.
24. As a Team Admin, I want one notification per Seat claimed, so that each Student who joins is visible.
25. As a Team Admin who claims a Seat on my own Team Licence, I want no notification, so that I'm not told about my own action.

### Question asked

26. As an Instructor, I want a notification when someone asks a Question on one of my lessons, so that I can answer it quickly.
27. As an Instructor, I want it to name the author, the course, and the lesson, so that I know where the Question is.
28. As an Instructor, I want clicking it to open unanswered questions, so that I can reply from there.
29. As an Instructor, I want no notification when I or a Platform Admin post a top-level comment on my lesson, because that is not a Question.
30. As a Platform Admin, I want no notification for new Questions, so that my inbox is kept for things only I can do.
31. As a Student, I want the notification not to show my Question text, so that the inbox only points to the lesson.

### Question answered

32. As the author of a Question, I want a notification when the Instructor or a Platform Admin answers it, so that I know to go and read the Answer.
33. As the author of a Question, I want it to name who answered, the course, and the lesson, so that I know which Question it was.
34. As the author of a Question, I want clicking it to open that lesson, so that I can read the Answer.
35. As the author of a Question, I want one notification per Answer, so that I don't miss a second Answer.
36. As an Instructor, I want a notification when a Platform Admin answers a Question on my course, so that I know staff stepped in.
37. As an Instructor, I want no extra notification when I answer a Question myself, so that I'm not told about my own reply.
38. As the author of a Question, I want no notification when another Student replies to it, because only an Answer counts.

### The bell

39. As anyone signed in, I want a bell in the sidebar header next to the Cadence logo on every app page, so that I always know where my notifications are.
40. As anyone signed in, I want a red badge with my unread count, so that I can see at a glance whether anything is new.
41. As anyone signed in, I want no badge when nothing is unread, so that the bell is quiet when there is nothing to do.
42. As anyone signed in, I want the badge to show "99+" above 99, so that it stays readable.

### The panel

43. As anyone signed in, I want clicking the bell to open a panel that slides in from the right over a dimmed page, so that I can look at notifications without leaving where I am.
44. As anyone signed in, I want clicking the backdrop or the close button to shut the panel, so that I can get back to my page.
45. As anyone signed in, I want the panel to open on an Unread tab that shows its count, so that I see what's new first.
46. As anyone signed in, I want an All tab, so that I can find something I've already read.
47. As anyone signed in, I want notifications grouped into Today and Earlier, newest first, so that I can tell what is recent.
48. As anyone signed in, I want each notification on one line with an icon for its kind, its text, and a short time such as "8m ago", so that the list is quick to scan.
49. As anyone signed in, I want unread items to stand out from read ones, so that I can see what I haven't dealt with.
50. As anyone signed in, I want an empty state when a tab has nothing in it, so that I know the list is empty, not broken.
51. As anyone signed in, I want clicking a notification to mark it read, close the panel, and open its page, so that one click takes me to the work.
52. As anyone signed in, I want a "mark as read" button that appears on hover, so that I can clear one item without opening it.
53. As anyone signed in, I want "Mark all as read" in the tab row, so that I can clear a burst, such as many Seats claimed, in one go.
54. As anyone signed in, I want "Mark all as read" to leave unread anything that arrived after my panel last updated, so that I never mark something read that I haven't seen.
55. As anyone signed in, I want the All tab to show my newest 50 notifications, so that the list stays short.
56. As anyone signed in, I want the Unread tab to show every unread notification, so that nothing unread is hidden.

### Freshness

57. As anyone signed in, I want the unread count to update on every page change and after every save, so that it is right as I move around.
58. As anyone signed in, I want the count to update about every 60 seconds while the tab is in view, so that I see new items without reloading.
59. As anyone signed in, I want the count to update straight away when I come back to the tab, so that it is right the moment I look.
60. As anyone signed in, I want the checks to pause while the tab is hidden, so that background tabs don't load the server for nothing.
61. As anyone signed in, I want an open panel's list to refresh with each check, with new items added at the top of Today, so that I see new things while the panel is open.
62. As anyone signed in, I want items already showing never to move or vanish because of a check, so that nothing jumps under my mouse.
63. As anyone signed in, I want a new notification to change only the badge (no toast, no sound, no tab title change), so that I'm not interrupted.
64. As anyone signed in, I want a failed check to stay quiet and keep the last count, so that a server restart or a network drop doesn't show me errors.
65. As someone whose session ended, I want the checks to stop, so that the next page change shows the usual sign-in or "Select a user" message.

### Links that no longer work

66. As anyone signed in, I want a notification to stay in my inbox even if its lesson was deleted or its Question hidden, so that my history doesn't change under me.
67. As anyone signed in, I want clicking such a notification to open the stored page and let that page behave as it already does, so that nothing special is needed.
68. As anyone signed in, I want a notification to keep the names it was sent with, even if a course is renamed later, so that it still makes sense.
69. As a Platform Admin, I want a "Refund Request raised" item to stay unread even after another Platform Admin decides that request, so that my read state only changes when I act.

### Keeping and clearing

70. As anyone signed in, I want notifications older than 90 days removed without warning, so that the inbox doesn't grow forever.
71. As the person running Cadence, I want the clean-up to run when the server starts and once a day after that, so that old notifications go away without anyone doing anything.
72. As the person running Cadence, I want the clean-up to be separate from refund, Seat and comment saves, so that a clean-up problem never blocks those saves.

### Emails

73. As a buyer, I want a failed refund email to leave my Refund Request and its inbox items saved, so that a mail problem doesn't undo what happened.
74. As a buyer whose refund email failed, I want to still be sent to Settings or the team page as usual, so that the app behaves normally.
75. As a Platform Admin, I want to see the normal approved or declined message even if the buyer's email failed, so that my decision stays clear.
76. As a buyer, I want refund emails sent to the address on my account at the moment of sending, so that they reach me even if I changed it.

### Local development

77. As a developer, I want each DevUI user seeded with a few notifications that fit their role (some read, some unread, some older than today), so that the bell, both tabs, and the Today and Earlier groups all show something.
78. As a developer, I want notifications stored in the same SQLite file as everything else, so that local dev and tests need no fake service.

## Implementation Decisions

### Who gets what

Each event sends its own notification. The person who caused the event never gets one. When one person qualifies twice for the same event, they get a single notification.

| Kind | Who gets it | What it names | Where it opens |
| --- | --- | --- | --- |
| Refund Request raised | Every Platform Admin except the buyer | Course, buyer | Refunds review (`/admin/refunds`) |
| Refund Request decided (buyer) | The buyer | Outcome, course, decision note if any | The course page |
| Refund Request decided (others) | Every Platform Admin except the decider and the buyer | Outcome, course, who decided | Refunds review (`/admin/refunds`) |
| Seat claimed | The Team Admin who bought that Team Licence, unless they claimed it | Student, course | Team page (`/team`) |
| Question asked | The course's Instructor | Author, course, lesson | Unanswered questions (`/instructor/questions`) |
| Question answered | The Question's author; plus the course's Instructor when a Platform Admin wrote the Answer | Who answered, course, lesson | That lesson |

- The buyer of a Refund Request is the person who made the Purchase: the Student on an Individual Purchase, or the Team Admin on a Team Licence.
- A Question is a top-level comment on a lesson whose author is not that course's Instructor and not a Platform Admin. An Answer is a reply to a Question by that course's Instructor or a Platform Admin. A reply by anyone else sends nothing. A top-level comment by the Instructor or a Platform Admin sends nothing.
- No notification holds or shows the Question text or the Refund Request reason.

### Storage

- One new table for notifications, with **one row per recipient**. A decided Refund Request sent to the buyer and three other Platform Admins is four rows. Read state lives on the row, so nothing is shared between people.
- A row holds: who it is for, its kind (one of the five), when it was sent, the details it needs **copied in at send time**, the page it opens (stored as-is), and when it was read (empty while unread).
- Copied-in details are things like the buyer's name, the course title, the lesson title, who decided or answered, the outcome, and (only for the buyer's decided item) the decision note. Later renames don't change a stored row, and a hard-deleted lesson doesn't break one.
- The wording ("Sam Lee asked for a refund on Intro to SQL") is **built by code when shown**, not stored, so it can change later without touching stored rows.
- Follow the existing table style: integer ids and times stored as ISO text.
- Schema changes go through the `database-migrations` skill: generate the migration, update the seed, reseed.
- There are no preference or muting fields. Nobody can turn a kind off in the first version.

### The notifications module

A new server-side module in `app/lib`, written like the refunds module: every function takes the database first, so tests can pass in an in-memory one, and uses positional parameters. Its outward interface:

- **Send functions**, one per kind. Each takes the database (or the open save, so it can join a transaction), the facts of the event, and the time. Each works out the recipients itself, applying the "who gets what" rules above, and writes one row per recipient.
- **List the inbox** for one person and one tab (Unread or All) at a given time. Unread returns every unread item. All returns the newest 50. Each item comes back ready to show: its kind, its finished text, the optional second line, the page it opens, when it was sent, and whether it is read. The Today and Earlier grouping and the short time are worked out from "sent at" and the current time.
- **Count unread** for one person: the true number. The bell turns it into "99+" above 99.
- **Mark one read**: only for the person's own notification. Does nothing if it is already read.
- **Mark all read up to a given notification**: marks the person's unread items up to and including the newest item the panel was showing. Anything newer stays unread.
- **Delete old notifications**: removes every row sent more than 90 days before a given time, read or not.
- No "mark as unread" in the first version.

### Where each kind is sent from

- **Refund Request raised**: inside raising a Refund Request in the refunds module, in the same save as the new request. Raising a request should become a single transaction so the request and its inbox rows are saved together.
- **Refund Request decided**: inside approving and declining in the refunds module, in the same transaction as the decision.
- **Seat claimed**: Seat claiming moves out of the redeem route into a database-first lib function (the redeem route calls it). That function writes the Seat claim, the Enrollment, and the Team Admin's notification in one save. Its existing checks and error messages stay the same.
- **Question asked and Question answered**: posting a comment moves out of the two route files that each have their own copy (the lesson page and unanswered questions) into one database-first lib function that both call. That function checks the body, writes the comment, works out whether it is a Question, an Answer, or neither, and writes the matching notifications in the same save. Editing and deleting comments stay where they are.

### Refund emails

- Both existing emails stay and go only to the buyer, through Postmark, or into `.outbox/` when there is no token, as today. The address is the one on the buyer's account at the moment of sending.
- "Refund requested" email: unchanged (course, amount paid, promise of a follow-up email; no reason).
- "Refund decided" email: unchanged (outcome, course, amount, the note when there is one). The amount stays in the email and is not in the inbox item.
- The email is sent after the save. If sending fails, the save and its inbox items stand. There is no warning, no retry, and Cadence records nothing about the miss. The buyer is still sent on to Settings or the team page, and the Platform Admin still sees the normal approved or declined message.
- Seat claimed, Question asked, and Question answered stay inbox-only. No purchase email is added.

### Serving the inbox to the browser

- The app layout's loader adds the unread count, so the badge is right on every page load, page change, and save (React Router re-runs the layout's loader after navigation and after each save).
- A new loader-only resource route returns the person's unread count and, when asked, one tab of their inbox as JSON. It needs a signed-in user, like other app pages. This is the first loader-only route in the app; the existing `api/*` routes only accept saves.
- Small save endpoints (actions) handle "mark one read" and "mark all read up to this notification". They only ever touch the signed-in person's own rows.
- The browser checks the resource route every 60 seconds while the tab is visible, pauses while it is hidden, and checks at once when the tab becomes visible again. This is the first background loading in the app; today nothing polls and there are no live connections.
- While the panel is open, each check also refreshes its list. New items are added at the top of Today. Items already showing are kept in place: a check never moves or removes them.
- A failed check is ignored: the badge keeps its last count, no error shows, and the next check runs 60 seconds later. A response saying the person is no longer signed in stops the checks.
- Two open tabs each catch up on their own next check. Nothing keeps them in step.

### The bell and the panel

- The bell sits in the sidebar header, to the right of the "Cadence" logo, for anyone signed in. Red badge with the unread count; no badge at zero; "99+" above 99.
- Clicking the bell opens a panel that slides in from the right over a dimmed backdrop. The backdrop or a close button shuts it.
- The panel has Unread and All tabs (opens on Unread, which shows its count), "Mark all as read" in the tab row, Today and Earlier groups newest first, and an empty state per tab.
- Each notification is one line: an icon for its kind (a decided Refund Request shows a green tick for approved and a red cross for declined), the text, a short time ("8m ago"), an unread marker, and a "mark as read" button shown on hover. The buyer's decided Refund Request adds the decision note as a short grey second line, cut off if long, and only when there is a note.
- Clicking a notification marks it read, closes the panel, and opens its stored page.
- The look follows variants A and B of the [throwaway prototype](https://github.com/MuizMohamad/cohort-005-project-fork/tree/prototype/notification-inbox). Variant C was rejected.

### The daily clean-up

- Deletes notifications older than 90 days, quietly. It runs once when the server starts and then once a day inside the same server process. Cadence runs as one long-running `react-router-serve` process, and this is its first timed job; there is no scheduler today.
- It is never part of a refund, Seat, or comment save.

### Seed data

- Each DevUI user gets a few notifications that fit their role: some read, some unread, some from today and some older. That way the bell, both tabs, and both groups show something in local dev.

### Choices without an ADR

None of these choices needs an ADR, because each is easy to reverse while the inbox is this small. If the inbox later outgrows Cadence's own table, the research in #7 found Knock the front-runner and Novu a close second.

## Testing Decisions

### What makes a good test here

- Test what a person would see, through the public functions: after an event, what is in each person's inbox, what it says, and what the unread count is. Don't test table rows or SQL directly when a list or a count can show the same thing.
- Each test builds a fresh in-memory database with the shared test setup, adds the people and data it needs, runs one event, then checks inboxes. Times are passed in, so tests fix "now" and never depend on the clock.
- Check both sides of every rule: who gets the notification, and who must not (the person who caused the event, the decider, the buyer for their own request, Platform Admins for Questions, other Students' replies).

### Modules to test

1. **The notifications module** (the main new seam):
   - Listing: Unread shows every unread item; All shows the newest 50 and no more; newest first; the finished text for each of the five kinds; the decision note as the second line only for the buyer's decided item, and none when there is no note.
   - Count: true unread count, including above 99.
   - Mark one read: marks only that item; cannot touch another person's item.
   - Mark all read up to an item: leaves anything newer unread.
   - Clean-up: deletes items older than 90 days, read or not, and keeps newer ones.
   - Copied-in names: renaming a course or deleting a lesson after sending doesn't change the shown text.
2. **The refunds module**, extending its existing tests:
   - Raising a request notifies every Platform Admin but not the buyer, including when the buyer is a Platform Admin.
   - Approving and declining notify the buyer (with outcome and note) and every other Platform Admin, never the decider, and give a buyer who is also a Platform Admin only the buyer item.
   - A refused decision (for example a Team Licence with a Claimed Seat, or a request already decided) writes no notifications.
3. **The new Seat-claiming function**:
   - A claim notifies the Team Admin who bought that Team Licence, once per Seat.
   - A Team Admin claiming their own Seat gets nothing.
   - Every refused claim (Seat on hold, refunded, already claimed, already enrolled, wrong country) writes no notification and keeps its current error message.
4. **The new comment-posting function**:
   - A Question notifies the Instructor only.
   - A top-level comment by the Instructor or a Platform Admin sends nothing.
   - An Answer by the Instructor notifies the Question's author only.
   - An Answer by a Platform Admin notifies the author and the Instructor.
   - A reply by anyone else sends nothing.
   - Its existing checks (empty or long body, missing lesson, parent on another lesson, replies only one level deep) still hold.

### Prior art

- The refunds module tests: a fresh in-memory database per test, small helpers to add learners and Purchases, a fixed "now", and checks through the module's public functions.
- The mailer tests, for code that sends after a save.

### Not covered by automated tests

The repo has no route or React component tests today, and this spec doesn't add them. The bell, the panel, the 60-second checks, pausing on a hidden tab, and the "items never move" behaviour are checked by hand in the browser with DevUI users. The route wiring (the layout loader, the resource route, the save endpoints) is thin and calls the tested functions.

## Out of Scope

- Muting or any notification settings.
- Mobile push and browser push notifications.
- Digest emails, such as weekly summaries.
- A live connection (server push) for the bell.
- Toasts, sounds, or changing the browser tab title for new notifications.
- Keeping several open tabs in step with each other.
- A full Notifications page, filters by kind, or "load more" past 50.
- "Mark as unread".
- Notifications for a new Enrollment, an Issued Refund, or a Failed Refund. Cadence doesn't record Issued or Failed Refunds yet.
- Notifications for editing or deleting a Question, an Answer, or a Refund Request.
- Marking a "Refund Request raised" item read automatically when someone else decides that request.
- Any new email, or any record or retry of a failed email.
- A third-party notification service.

## Further Notes

- Map: [Wayfinder: in-app notifications spec](https://github.com/MuizMohamad/cohort-005-project-fork/issues/6). Decisions: [#7 services research](https://github.com/MuizMohamad/cohort-005-project-fork/issues/7), [#8 which notifications and to whom](https://github.com/MuizMohamad/cohort-005-project-fork/issues/8), [#9 own inbox, no vendor](https://github.com/MuizMohamad/cohort-005-project-fork/issues/9), [#10 the inbox's look and place](https://github.com/MuizMohamad/cohort-005-project-fork/issues/10), [#11 no muting](https://github.com/MuizMohamad/cohort-005-project-fork/issues/11), [#12 refund emails stay](https://github.com/MuizMohamad/cohort-005-project-fork/issues/12), [#13 bell freshness](https://github.com/MuizMohamad/cohort-005-project-fork/issues/13), [#14 storage and keeping](https://github.com/MuizMohamad/cohort-005-project-fork/issues/14).
- The guiding rule from #14: keep it simple and easy to change later.
- Facts found in the code for the build: course titles can be edited; Instructors hard-delete lessons and modules; comments are soft-deleted; the sidebar's data comes from the app layout's loader.
- Moving Seat claiming and comment posting into lib functions also removes the duplicated comment-posting code in the two routes.
