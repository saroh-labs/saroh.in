---
title: "Round 2 — the next screens: overview, phases and defaults to confirm"
type: overview
status: active
date: 2026-09-26
origin: /saroh-designs gap reports (home-calendar-settings, customers, orders-invoices, subscriptions-plans, courses-packs, bookings-site, site-editor, team-storefront) and the .dc.html designs they compare against
decisions: ADR-011, DEC-037 – DEC-048, amendments to ADR-007 and ADR-008
---

# Round 2 — overview

## What this round is

The designs of 25 and 26 September cover Home, the Business Calendar,
Settings, Customers, Orders, Invoices, Subscriptions and Plans, Class packs,
Bookings and the Service Editor, the booking pages, the Site Editor and the
Customer Site. Each gap report says which parts of each screen are new,
which have changed and which are done. The user settled the reports' big
questions on 2026-09-26 (DEC-037 – DEC-048). This page:

- splits the work into eight epics, each with its own plan;
- orders the work in three phases;
- names the dependencies between epics;
- lists every other default the plans took, for the user to confirm.

The designs stay the source of truth for each screen and are referenced by
file name. `DESIGN-NOTES.md` has the reasoning behind them.

## The epics

| Epic | Plan | Units | What it delivers |
|---|---|---|---|
| A. Customer accounts and messaging on merchant sites | [001](./2026-09-26-001-feat-customer-accounts-plan.md) | 14 | Sign-in by a one-time code sent by email, one account per business (ADR-011); no phone sign-in this round. An account area with bookings, orders and tracking, plan and packs, messages and Me. Credits and packs online, a class waitlist, and customer messages. |
| B. Orders and fulfilment | [002](./2026-09-26-002-feat-orders-fulfilment-plan.md) | 16 | Richer list API and rows, filters, quick view, bulk kitchen actions, states, Order Detail changes, six fulfilment types with shipping tracking, a pay link for an order, New order v2. |
| C. Customers | [003](./2026-09-26-003-feat-customers-plan.md) | 14 | The business-wide Customers list and its API, Needs attention, Customer Detail gaps, merge, privacy removal, email and address editing, reviews and packs on the detail. |
| D. Payments | [004](./2026-09-26-004-feat-payments-plan.md) | 18 | The Plans tab, Plan Detail, and the Plan Editor with drafts and the shared editor shell. Plan and subscription event logs, pause with an end date, and classes from the next renewal. Provider autopay (DEC-038). Invoices: bill of supply, PDF, sending, the source filter and locked states. |
| E. Bookings, services, packs and calendar | [005](./2026-09-26-005-feat-bookings-packs-calendar-plan.md) | 28 | The Service Editor (visits, deposits, "Either", show on the booking page), time off ranges and business closed, new-booking search, and the booking page's gaps. Packs, Pack Detail and Pack Editor with drafts. The Business Calendar's second pass. |
| F. Home and Settings | [006](./2026-09-26-006-feat-home-settings-plan.md) | 16 | The Home redesign, Settings' real differences, Team's hidden column, and storefront people joining the team. |
| G. Site editor and customer site | [007](./2026-09-26-007-feat-site-editor-customer-site-plan.md) | 21 | The #260 split first, then bound blocks, module pages, header and footer text, Undo toasts, the narrow layout and in-place preview. Customer site v2 without the brand: shop and bag, Prices, On today, open or closed, and nav gated by module. |
| H. Design system: Brand v2 | [008](./2026-09-26-008-feat-brand-v2-plan.md) | 10 | **The font-leak fix (phase 1).** Then Brand v2 with choice: a font catalogue of pairings and a palette catalogue plus a custom colour, both extensible as data; the brand API and panel, a logo, contrast, starting themes, and existing sites moved across as close as they look. Hindi is later. |
| | | **137** | |

**The font fix changes every live site.** On the day H1 ships, every
merchant site's text moves from Saroh's fonts to a neutral system font stack,
and stays there until the merchant picks a font pairing in Brand v2. Colours
do not change. The user chose to ship it now (2026-09-27; default 141).

Also written: [the permission matrix](./2026-09-26-permission-matrix.md)
(DEC-039), and ADR-011.

Unit IDs are per epic (A1…A14, B1…B16, and so on). Each plan's units say
Goal, Files, Approach, Dependencies, Test scenarios and Verification, and
none is bigger than one to two days of agent work.

## Phases

**Phase 1** needs no further decision: the user has decided it, or it rests
on an existing ADR. It includes the font-leak fix. **Phase 2** builds on
phase 1's foundations, or rests on a default in the list below; confirming the
defaults while phase 1 runs keeps phase 2 unblocked. **Phase 3** waits on the
permission matrix review (DEC-039).

### Phase 1

| Epic | Units |
|---|---|
| H | **H1 font-leak fix** (first, alone, small) |
| A | A1 identity tables · A2 email codes · A3 site session and sign-in sheet · A4 account ↔ contact linking · A5 account area shell, Home and Me |
| B | B1 list API · B2 fulfilment types API · B3 rows and tabs · B4 filters, search and export · B5 quick view and row menu · B6 bulk kitchen actions · B7 states and locked cards · B10 shipping panel · B11 pay link for an order |
| C | C1 Needs attention API · C2 a contact for every paying customer · C3 customers list API · C4 Customers list screen · C5 Needs attention on the detail · C6 Reviews tab · C7 packs on the detail · C8 edit email and address · C14 copy and phone polish |
| D | D1 plan API · D2 plan events · D3 Plans tab · D4 Plan Detail · D5 drafts API · D6 editor shell · D7 Plan Editor · D8 pause with an end date · D9 subscription events · D10 classes from the next renewal · D18 invoices source filter and locked states |
| E | E1 service fields · E2 Service Editor · E3 time off and business closed · E4 new-booking search · E5 peek, locked state and copy · E7 Where and the intake note · E11 UPI/card checkout on the booking page · E14 pack drafts · E21 calendar copy, range and shortcuts · E28 keyboard grid and day sheet |
| F | F1 Needs-you sources · F3 flat Needs you · F5 Today column · F6 greeting and Last 24 hours · F8 take-money checklist · F9 Reviewer view · F12 Settings Undo and states · F13 turn-off consequences · F15 hide Extra permissions · F16 storefront people join the team |
| G | G1 editor split · G2 top bar and status · G3 Undo toasts · G4 narrow layout · G5 in-place preview · G6 header and footer text · G7 text-block photo · G8 Visit us · G10 Journal · G11 public catalogue and product page · G12 Product grid · G17 site header and footer v2 · G18 On today and open or closed |

### Phase 2

| Epic | Units |
|---|---|
| A | A6 account bookings · A7 orders and Track · A8 plan and packs · A9 sign-in to book, recognition · A10 credits online · A11 buy packs online · A12 class waitlist · A13 message thread · A14 transactional messages |
| B | B8 Order Detail quick wins · B9 cancel as refund, change fulfilment · B12 product fulfilment types · B13 New order v2 · B14 Visits card · B15 Needs attention on orders |
| C | C9 merge API · C10 merge screens · C11 privacy removal · C12 booking-page notes |
| D | D11 mandates port and Razorpay · D12 autopay set-up by the customer · D13 renewals charge the mandate · D14 autopay in the workspace · D15 bill of supply · D16 invoice PDF · D17 send an invoice |
| E | E6 header facts and half-hour starts · E8 deposits · E9 visits API · E10 visits on the page and in Bookings · E12 Class packs module · E13 pack API · E15 Packs list and sell dialog · E16–E17 Pack Detail · E18 Pack Editor · E19–E20 calendar API · E22 named problems · E23 money cells · E24 days off and team · E25 Week view · E27 hour grid |
| F | F2 more Needs-you sources · F4 inline actions with Undo · F7 This week · F10 business types · F14 alerts |
| G | G9 Plans block · G13 bag and checkout · G14–G16 module pages · G19 module-gated nav · G20 Prices · G21 new-site setup |
| H | H2 brand contract · H3 font and palette catalogues · H4 contrast rules · H5 font files per site · H6 renderer · H7 logo · H8 Brand panel · H9 starting themes · H10 existing sites move across |

### Phase 3

| Epic | Units | Waits on |
|---|---|---|
| B | B16 orders permission pass | matrix review |
| C | C13 customer permissions | matrix review |
| E | E26 booking permissions (`booking:settings`, `pack:sell`) | matrix review |
| F | F11 staff landing | matrix review |

## Dependencies between epics

- **Customer identity** (A1–A4) comes before:
  - the rest of A;
  - D12 (a customer sets up autopay);
  - G13 (checkout signs in at the last step) and G20 (join and buy on Prices);
  - C9 and C11 (a merge or a removal moves or retires an account).
- **Needs attention** (C1) comes before C5, C12, B13 (allergy clash), B15, E4,
  F2 and A5 (a customer's own health note).
- **The permission matrix** (DEC-039) gates B16, C13, E26 and F11. Units
  before it build against today's actions. The sensitive gate falls back to
  Owner and Admin (via `contact:write`) until C13 swaps in
  `customer:sensitive`.
- **The draft helper and editor shell** (D5, D6) come before D7, E14 and E18,
  and later the course editor.
- **Fulfilment types** (B2) come before B10, B12, B13, A7 (Track) and G13.
- **Visits** (E9) come before B14 and A6.
- **The pay link for an order** (B11) comes before B13 and E4.
- **Messages** (A13, A14) come before F2, F4 (Reply), D17 (the account-thread
  copy) and B9 ("tell the customer"). D17 can ship on a connected email
  provider without them.
- **Mandates** (D11) come before D12, D13, F4 (Retry) and A8.
- **Pause with an end date** (D8) comes before A8.
- **Published-only reads** (D5, E14) come before G9, A11 and G20.
- **Class packs module** (E12) comes before A11, G20 and F13's packs row.
- **The editor split** (G1) comes before G2–G6, G16 and H8.
- **The brand contract and the catalogues** (H2, H3) come before G21 and H8.
- **The public catalogue** (G11) comes before G12 and G13. It needs G8's
  "sells from" storefront first.
- **Within and across epics, found while planning:**
  - E9 needs B2 (the Appointment type);
  - E4 uses B11's pay-link pattern, and its Needs attention part follows C1;
  - E22's Retry and Send a reminder stay hidden until D13 and D17 ship;
  - E14 needs D5 to land first in phase 1;
  - D8 waits on D9, so an automatic resume is logged;
  - D12's account and join-sheet entry points need A3/A5 and G20, and its pay-link entry needs only D11;
  - F4's Retry, Send reminder and Reply need D13, D17 and A13, while Mark sent and Retry by pay link ship first;
  - B13 uses C2's contact helper;
  - B14 needs E9;
  - G14 needs G8, G10 and G12;
  - H8 needs G2.

## Later (not planned this round)

- **Phone sign-in and SMS** — phone codes, a verified phone on the account,
  and SMS or WhatsApp messages to it. Out of this round (user, 2026-09-27);
  it comes back as its own decision, including who sends and pays for SMS
  (ADR-011 §6). The former A15.
- **Courses** — the Courses, Course Detail and Course Editor screens
  (DEC-044), with everything the courses-packs gap report lists for them:
  - deposits, per-session charging, the late-join cut-off, the waitlist,
    make-ups and attendance;
  - course staff and place, and a Room model;
  - skipped weeks, the held-session lock and the date-change review;
  - the Courses layer on the calendar and the Courses tab on Customer Detail.

  Built courses keep working.
- **Hindi** — a `locales` list in the section contract, with Hindi on the
  site, in the editor and in the customer site's strings (plan 008, "Later").
- **Saroh's own billing** in Settings › Plan & billing: Saroh invoices,
  usage and a plan picker. It gets its own plan (DEC-014).
- **Cashfree mandates** — after Razorpay's (D11).
- **Courier booking** ("Book pickup") — DEC-045 records the courier only.
- **Draft orders** — not designed.
- **The #247 action rail** on Customer Detail.
- **Payouts and expenses** — a separate Money area (DESIGN-NOTES,
  Calendar second pass).
- **Removing "Runs on Saroh"** from a site, and corner and button styles.
- **Rooms or resources** for bookings.
- **Subscriptions that take stock** (DESIGN-NOTES, parked).

## Defaults taken — confirm

One line each. Each one is repeated where it applies, in the plan that uses
it.

**Customer accounts (A)**

1. A site offers email sign-in only; there is no phone field. (Decided 2026-09-27: phone codes and SMS are out of this round.)
2. Browsing is open, and a code is asked for at the last step of booking or buying. The invoice pay link needs no sign-in.
3. Once accounts are on for a site, guest booking and guest checkout end there.
4. The code email's sender name is "‹Business› via Saroh", from Saroh's identity sender.
5. Codes are 6 digits, live 10 minutes and allow 5 tries; resends wait 30 seconds, with at most 5 an hour and 10 a day per email address.
6. Sessions last 30 days, renewed on use, and never more than 90.
7. A first sign-in links to the one contact with that verified email. The merchant can undo it ("This isn't them"). Zero or several matches make a new contact and a duplicate suggestion.
8. From their account a customer can pause, resume or cancel at period end, and pay a failed invoice. Plan changes stay with the business.
9. A class waitlist offers a freed place to the first person in line and holds it for 2 hours (or until 1 hour before the class, whichever is sooner), then offers it to the next.
10. Messages about a customer's own orders, bookings and invoices need no marketing consent; marketing still does.
11. "Remove my details" in Me sends the business a request; staff act on it with privacy removal.
12. A health note a customer adds arrives as a suggestion for staff to confirm, like a booking-page note.

**Orders (B)**

13. The refund sheet keeps "Or another amount". It is capped at what is refundable, needs a reason, is not tied to lines and returns no stock.
14. Tabs are All · Open · Refunded; cancelled orders stay under All.
15. A product lists the fulfilment types it allows (by default, every type its storefront offers), and an order offers only types every item allows.
16. Late rules per type follow the design's values and can't yet be set per business:
    - Pick-up: 2 hours after it was placed. Today's rule is 20 minutes, a kitchen-counter rule.
    - Local delivery: 24 hours.
    - Shipping: 48 hours.
    - Digital: never late.
    - Appointments: judged by their visits.
17. Changing how an order is fulfilled charges or refunds the difference in delivery on the order (a supplementary invoice or a credit note).
18. The existing Collect becomes Pick-up and Delivery becomes Local delivery; the `trackingUrl` stays as the optional link.
19. New order's walk-in customer needs no contact; one is made only if a phone or email is typed.

**Customers (C)**

20. Spent = paid orders (delivery included) + paid invoices that aren't order invoices (subscriptions, packs, hand-written), net of refunds and credit notes. "Customer since" = the first payment.
21. Add customer and Import stay on the Customers list; both make contacts.
22. When two contacts are merged, the merchant picks the survivor (the older one is offered).
23. A merge is refused while both people hold a live subscription to the same plan; one is cancelled first.
24. On a merge, consent per channel takes the more recent answer, notes are kept side by side, and Needs attention entries are combined with duplicates collapsed.
25. Privacy removal is refused while an order is open or a subscription is live.
26. On removal, future bookings are cancelled, and past bookings keep time and service with the name "Removed customer".
27. The Courses tab and card on Customer Detail wait for Courses (DEC-044).
28. Customer Detail tabs scroll sideways on phones instead of wrapping.

**Payments (D)**

29. Plans keep week, month, quarter and year in the API. The editor offers month and year, with week and quarter under "More". The currency is the business's, with no picker.
30. Pause offers 2, 4 or 8 weeks, which resume on their own, or "Until I resume".
31. The Plan Editor's classes section shows only when Appointments is on.
32. A change to a plan's classes applies from each member's next renewal.
33. "Subscribe someone" and search stay on the Subscriptions list, and `/billing/plans` redirects to the Plans tab.
34. Mandates start with Razorpay (UPI Autopay and cards), and Cashfree follows.
35. "Retry" on a failed renewal retries the mandate when there is one, and sends a pay link otherwise.
36. A GST-registered business's invoice whose lines are all exempt or nil-rated is titled "Bill of supply", in the same number series. An unregistered business keeps "Receipt".
37. Invoice PDFs are rendered by the API on request, from the same data as the printed paper, and are not stored.
38. Sending an invoice or a reminder goes through the business's connected email provider, and into the account thread when the person has an account. With no provider, the options are "Copy pay link" and a WhatsApp link; Saroh's email is never used.

**Bookings, packs and calendar (E)**

39. Deposits are None, 25%, 50% or Full. A free cancellation refunds the deposit automatically through the provider; a late one keeps it.
40. A multi-visit treatment is one order (Appointment type) with one booking per visit, invoiced once for the whole treatment when paid.
41. Booking-page slots start on the hour and the half hour for every business.
42. The Service Editor keeps Delete, the time zone, the buffer and the per-service availability rules under "More settings" (00-universal §15); the currency is the business's.
43. The services on the booking page follow each service's "Show on booking page" switch automatically.
44. Class packs become their own module (it needs Appointments), turned on for businesses that have packs; "Also sell" and Settings › Modules flip the same switch.
45. A pack has a kind, Classes or One-to-one sessions. A one-to-one pack pays for one-to-one services, which amends ADR-008's "packs cover classes only". The kind is locked once a pack is sold.
46. An extension adds at most 30 days at a time and is logged; validity is at least 7 days.
47. Calendar fees are the fee each provider reports on a payment, never an estimate. Out = refunds + reported fees.
48. The clinic's Payments layer reads paid invoices.
49. The calendar has no Courses layer this round.
50. A pay-at-session booking's Due is the service price less any deposit paid.

**Home and Settings (F)**

51. On Home, Undo is offered only before a message leaves (a 10-second hold), never after.
52. "Payout on the way" is dropped; there is no data source for it.
53. CRM follow-ups stay on Home.
54. A module that's off shows one shared state: "‹Module› is off · Owners can turn it on in Settings".
55. There is no financial-year picker (DEC-028).
56. Turn-off consequences are real counts from the API.
57. Settings keeps its Activity and Hours tabs.
58. Custom roles are shown, not marked "Coming soon", because they are built.
59. Country stays in the Registered address card (DEC-029), not in Identity as the design moves it.
60. The business types are the design's six, plus Not set: Individual / sole proprietor, Partnership, LLP, Private limited, Public limited, Trust or society. Today's "company" becomes Private limited.
61. Where staff work is read from the staff member's team membership and their storefront roles (DEC-048). No new table.

**Site editor, customer site and brand (G, H)**

62. The Site Editor keeps Tablet and Zoom (00-universal §15; #347 put them back).
63. A reviewer works on `/review` (#275), not in the editor, and Members don't reply to review notes.
64. Placeholders are marked per field on the server, not detected by pattern.
65. An existing site keeps its colours exactly until its merchant saves a brand; nothing is rewritten, and the old contract version keeps validating. When Brand first opens, it offers the nearest palette (or the site's own accent as a custom colour when no palette is close), keeps the site's band rows, and offers the font pairing closest to the site's old type.
66. A merchant picks one of several ready-made palettes (eight to start: working names Terracotta, Sunflower, Rose, Plum, Ocean, Forest, Stone and Night) or a custom colour. Any hex is allowed as the custom colour, with contrast worked out automatically (button text and link shade reach 4.5:1); a catalogue palette must pass without adjustment.
67. "Runs on Saroh" stays on every site this round.
68. A site uses the business's logo unless a site logo is set, and the letter is the fallback.
69. Fonts come from a catalogue of pairings, each a heading face and a body face with Devanagari coverage. Six to start: Plain (Geist, Geist), Lively (Bricolage Grotesque, Geist), Geometric (Space Grotesk, Geist), Serif (Instrument Serif, Literata), Book (Literata, Literata) and Friendly (Poppins, Hind). Under Advanced, the heading or body face can be swapped. Faces are self-hosted by `saroh.app`; nothing is loaded from a third party at view time.
70. Hindi, when it comes, is a general `locales` list with Hindi the only one offered.

**Taken while writing the plans** (each plan names them where they apply)

*Customer accounts (A)*

71. Customer accounts are switched on one site at a time. Sites without them keep anonymous booking until every site is switched.
72. Codes and destinations are stored as keyed hashes under a new server secret. Session tokens are stored as SHA-256.
73. Code limits per destination and per business are counted from stored rows, so they survive a restart. The per-address limit uses the existing in-process limiter.
74. Expired or used codes, sessions and waitlist rows are deleted after 30 days by a cleanup job.
75. From Me, a customer can change their name, email and phone. A new email is checked with a code; the phone is a contact detail, not a way to sign in.
76. No waitlist offer is made within 1 hour of a class starting.
77. Customer messages have their own thread tables. Anything sent outside the account is recorded in the existing `Message` and `Delivery` records.
78. A contact without a site account gets no in-account messages. Staff copy says "They'll see it when they sign in on your site".
79. A contact made at first sign-in has the source `SITE_ACCOUNT`.

*Orders (B)*

80. Collect becomes PICKUP and Delivery becomes LOCAL_DELIVERY in the enum. The stages gain Out for delivery and Sent.
81. Handover is Collected, Out for delivery, Handed to courier, Sent, or the first attended visit. After it, an order can't be edited, re-fulfilled or cancelled, but it can still be refunded.
82. The courier name and tracking number are optional, can be added after handover, and can be filled in by anyone with `order:stage`.
83. The refund reasons offered are: Customer changed mind, Item unavailable, Quality, Late, Other. Free text can be added to any of them.
84. A cancel refunded online reads Cancelled only once the refund settles (DEC-026).
85. An order's pay link is `saroh.app/pay/o/<token>`, charged through the order's storefront's provider. It is cleared when the order is paid, cancelled or refunded.
86. A bulk kitchen move takes at most 100 orders, each naming the stage it expects to move from.
87. The Orders list pages by cursor, 50 at a time. Tab counts apply every filter except the tab itself.
88. New order is hidden for a business whose products are all appointments.

*Customers (C)*

89. On a merge, the merchant picks the survivor's name, email, phone, company and address. Values not chosen survive only where orders or invoices printed them.
90. A merge is also refused while both people hold an active enrolment in the same course.
91. A merge can't be undone, and its dialog says so.
92. A dismissed duplicate pair stays dismissed.
93. A removed contact's email becomes a unique placeholder that can't be delivered to, and every reader treats it as no email.
94. Privacy removal offers to delete form entries and leads too, unticked by default.
95. A booking-page note counts as sensitive until staff confirm it.
96. Without contact access, a search that looks like a phone number or an email runs as a name search.
97. A contact's address is six new optional fields, following DEC-029's state and PIN rules.
98. The old allergen note rows are written for one more release, then dropped in a two-deploy change.

*Payments (D)*

99. The plan and subscription event logs start at deploy. Older records say "Changes before 26 Sep weren't recorded".
100. An automatic resume that comes due while Payments is off leaves the subscription paused, and Home raises it.
101. Plan names are unique per business, ignoring case, among Active and Draft plans.
102. Mandates pay subscription renewals only this round.
103. When a price rises above the mandate's limit, the customer is asked to authorise again.
104. An invoice reminder goes at most once a day.
105. Sending an invoice makes a new pay link, and the old one stops working.
106. With no email provider, "Share on WhatsApp" is a link with the message filled in.

*Bookings, packs and calendar (E)*

107. A business closure is its own table (`BusinessClosure`).
108. A closure or time off warns about the bookings it covers and cancels nothing.
109. A service offered either way records the customer's choice on the booking. The meeting link shows only on online bookings.
110. The booking page's intake note is at most 1,000 characters. It is stored as sensitive and kept out of logs.
111. Visits are booked in order, and never more than the service's count.
112. A cancelled visit refunds nothing by itself; money comes back through the order's refund.
113. The booking page's header shows the registered address, the opening hours and the business's public phone.
114. A pack sale records how it was paid: Cash, UPI, Card, Bank, Online or None.
115. An expired pack can still be extended.
116. A payment's fee is stored as the provider reports it in its webhook.
117. The calendar reads by from and to dates, and the month query stays as an alias for one release.
118. The calendar's CSV is built in the app from the same items as the screen.
119. The calendar goes back to the business's creation date until a joined date exists.
120. Class packs need their own rollout flag in each environment.

*Home and Settings (F)*

121. Home's Needs you shows at most 12 rows, then "See all N".
122. An inline action that sends no message runs at once, and its Undo uses the record's own undo window.
123. Home's take-money checklist and Settings' "Ready to take payments" read the same list of steps. Hiding the checklist is remembered per person in the browser.
124. For one release, an old app sending the type `company` is saved as Private limited.
125. Settings offers no Undo where the old values can't be put back: a GST registration that has already numbered an invoice, or a replaced logo.
126. Alerts start with the bell on for everything, email on for failed payments only, and WhatsApp off. A channel with no provider shows as off.
127. The Monday summary alert can be set now and reads "Starts when business messages are on".
128. Adding someone to a storefront never lowers a business role they already hold.
129. On the staff landing, someone with no storefront role sees every storefront.
130. For one release, Home's API sends its old fields beside the new ones.

*Site editor and customer site (G)*

131. A site sells from one storefront, stored on the site. It defaults to the first open storefront with listings, and a picker shows only when there are several.
132. Module pages are ordinary pages with a kind (Shop, Book, Prices, Journal, Contact), at most one of each per site, at /shop, /book, /prices, /journal and /contact. Existing sites get none until the merchant adds them.
133. A module page whose module is off leaves the menu, and its address shows "This isn't available right now".
134. The bag lives in the browser and holds only ids and quantities. The order is made when payment succeeds.
135. The shop takes online payment only this round; with no provider it says it isn't taking online orders yet.
136. An Undo toast lasts 10 seconds. Discard all, restore a version and "Start this site again" still ask first.
137. The text-block photo is an optional field on the current contract version, with alt text required.
138. "On today" shows only for businesses with Appointments.
139. Without `site:update`, the inspector shows the site name and footer text as read-only.
140. Until autopay ships, Join on Prices issues the first invoice with its pay link. With Payments off it offers "Ask about joining".

*Brand (H)*

141. After the font fix, every merchant site uses a neutral system font stack until its merchant picks a font pairing, and Saroh's own pages in `saroh.app` use it too. **This changes how every existing site looks on the day it ships** (user: ship it now, 2026-09-27).
142. A pairing may use Geist, Bricolage Grotesque or Space Grotesk as the merchant's own font. These are served from a separate copy for sites, never from Saroh's font files.
143. Brand v2 is version 2 of the existing site style, with no database migration: a v1 style is read as v1 until its merchant saves.
144. The old colour rows and spacing sliders stay under "Advanced".
145. A site in dark mode is dark for every visitor, whatever their system setting.
146. The logo is fixed when the site is published; a later change shows as an unpublished brand change.
147. The suggested starting theme follows the modules: clinic-like appointments suggest Calm clinic, classes or packs Bright studio, and selling only Warm bakery. Each theme is a palette and a pairing from the catalogues.
148. The brand needs `site:update` and a logo upload `media:write`, so plan H waits on no permission review.
149. A catalogue entry is never deleted. A retired palette or pairing leaves the pickers and keeps rendering for the sites that use it.
150. The catalogues are data files in `packages/site-blocks`, read by the API, the editor and the renderer; a new entry ships with a release, not from the admin console.

## Still for the user to decide

- **The permission matrix review** (DEC-039), with the eleven questions at the
  end of the matrix.
- **Saroh's own billing** (Settings › Plan & billing): when, and in which
  plan.
- **The Pick-up late rule** (default 16): the design's 2 hours, or today's
  20 minutes.
