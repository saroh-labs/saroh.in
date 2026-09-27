# ADR-011 — Customer accounts on merchant sites

**Status:** Accepted — 2026-09-26 (DEC-037); amended 2026-09-27 (email only this round, §6); implementation pending
**Supersedes in part:** [ADR-008](./ADR-008-operations-staff-gst-kitchen.md) §2 "The public booking page" (the limits on credits online, buying packs online, a waitlist, customer recognition, sign-in and customer messages) and §3 "Not sending email or SMS" (for sign-in codes and for messages sent through a business's own provider)
**Amends:** DEC-011 (Saroh's own email also sends a site's sign-in codes) · ADR-008 §2 "One read of a customer" (merge, DEC-042)
**Builds on:** [ADR-001](./ADR-001-organization-tenant-root.md) (Organization is the tenant root) · [ADR-007](./ADR-007-subscriptions-invoices-classes.md) (the Contact is the person) · ADR-009 (merchant sites run on `apps/saroh.app`, and customer-facing server routes call the API) · DEC-027 (client addresses behind proxies)
**Plan:** [docs/plans/2026-09-26-001-feat-customer-accounts-plan.md](../../plans/2026-09-26-001-feat-customer-accounts-plan.md)

---

## 1. Context

The Customer Site, Book Kavi Dental and Book Pulse Fitness designs give a
business's own customers an account on that business's website: sign in with
a code, see coming-up bookings, track an order, manage a membership, spend a
class credit, buy a pack, join a class waitlist, and message the business.

ADR-008 ruled all of that out for the public booking page, because Saroh sent
no email or SMS and so could not check who was asking. Credits were used only
at the desk, packs were sold only by staff, and nothing on a merchant's site
knew who the visitor was.

Decided with the user on 2026-09-26:

- **Yes, starting now.** People who sign in on a merchant's site are that
  business's customers and the users of that site.
- **Sign-in is a one-time code**, sent by email.
- **Accounts are per business**, never shared across Saroh.
- Email codes go through Saroh's email.

Decided with the user on 2026-09-27:

- **Sign-in is email only.** Phone codes and SMS are out of this round, not
  deferred behind a payer question. Phone sign-in is a later step with its
  own decision (§6).

## 2. Decisions

### An account belongs to one business

- **`CustomerAccount`** is an organization-owned row: `organizationId`
  (required, RLS `org_isolation`), a required `contactId`, a verified email
  (lower-cased, trimmed) with its `verifiedAt`, a status (`ACTIVE`,
  `BLOCKED`, `REMOVED`), `createdAt` and `lastSignedInAt`. A verified phone
  is not part of this round; it is added with phone sign-in (§6).
- **A verified email is unique per business**, not across Saroh (a partial
  unique index on `(organizationId, email)` where the account is not
  removed). The same person
  at two businesses has two accounts, two sessions and two histories; neither
  business can see that the other exists.
- **It is not a Saroh user.** Better Auth's `User` is the workspace identity
  (staff of a business, Saroh staff) with a session cookie shared across
  `saroh.in` subdomains (DEC-003). A customer never gets a `User`, never
  reaches `accounts.saroh.in`, and a workspace session never signs anyone in
  on a merchant site. Keeping the two apart means a bug in one cannot hand a
  customer the workspace, or a merchant's staff a customer's account.

### Signing in is a one-time code

- One flow for new and returning people: type an email, receive a six-digit
  code, type it. Verifying a code for a destination with no account
  creates one. The response never says whether an account existed.
- **`CustomerSignInCode`** stores the business, the channel, a keyed hash of
  the destination, a keyed hash of the code (never the code), `expiresAt`
  (10 minutes), `attempts` (5, then the code is dead) and `consumedAt`. A new
  code for the same destination retires the old one.
- **Limits** — per destination (a resend no sooner than 30 seconds, at most 5
  codes an hour and 10 a day), per client address (DEC-027's address), and per
  business, so one site cannot be used to spray codes at numbers. Codes are
  refused while the business is suspended or closing
  (`assertOrganizationOpen`).
- **Email codes go through Saroh's own identity email**, the sender that
  already sends workspace sign-in codes, with the business's name in the
  display name and body ("Your code for Kavi Dental"). This widens DEC-011's
  "Saroh-owned email is identity mail only" to a site's customers' identity
  mail — still identity, never a business message.
- **Email is the only channel this round.** The sign-in sheet has no phone
  field, and the API has no SMS sender or port. A code request names no
  channel; it is an email.

### A session lives on the site's own host

- **The cookie is host-only** on the host the site is served from
  (`kavi.saroh.app` or the business's own domain): `__Host-` prefix,
  `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`. A cookie on
  `.saroh.app` would be sent to every business's site; this is the one rule
  here that must never bend.
- **The token is opaque** (256 random bits), stored only as its SHA-256 in
  `CustomerSession` with the account, the business, the site, `expiresAt`
  (30 days, sliding on use, 90 days at most), `lastSeenAt` and `revokedAt`.
  Signing out, removing the account, blocking it, a merge that retires it and
  "sign out everywhere" revoke sessions.
- **The browser never calls the API with it.** The site's server routes in
  `apps/saroh.app` read the cookie and call `api.saroh.in` server-to-server
  (ADR-009), sending the token and the host they served. The API resolves the
  host to its Site and Organization first and accepts the session only if it
  belongs to that business — a token from one site is a 401 on another.
- State-changing requests from the site go through its own route handlers,
  which check `Origin` against the host; the API's `OriginGuard` stays as it
  is for the workspace.
- The invoice pay page (`saroh.app/pay/<token>`, ADR-007) stays a token link
  that needs no sign-in.

### An account is a Contact

- **Every account points at exactly one Contact** in its business — the
  business-wide record of a person (ADR-007). Bookings, subscriptions, packs,
  invoices and notes already hang off the Contact, so the account area reads
  them through it and nothing is copied.
- **On first sign-in**, the verified email is matched against the
  business's contacts. **Exactly one contact** with that normalised value and
  no account → the account is linked to it, and the contact shows "Signs in
  on your website" with **"This isn't them"**, which unlinks and moves the
  account to a new contact. **None, or more than one** → a new contact is made,
  and the ambiguous ones are listed as possible duplicates for the merchant to
  merge (DEC-042). Saroh never merges on its own.
- **An online order placed while signed in** makes or reuses the storefront's
  `Customer` for that account and links it to the account's Contact as a
  confirmed identity link — verified by the code, so no "possible match" step.
  A guest order (where one is still allowed) behaves as today.
- **What the customer sees is an allow-list**: their bookings, orders and
  their steps, their plan, packs and credits, invoices and receipts, their
  messages and the details they gave. Never staff notes, never a
  Needs attention entry's staff wording, never another person on the same
  booking. Health notes they add are add-only (they can see and add their
  own; they cannot edit what staff have recorded).

### What a signed-in customer may do

These replace ADR-008's "no" for the public booking page:

- **Spend a class credit online** on a class the pack covers, with the same
  rule the desk uses (covers the service, a class left, valid when the class
  starts) and the same late-cancel rule.
- **Buy a class pack online**, paid through the business's provider; the pack
  is recorded when the payment succeeds, never before.
- **Join a class waitlist** when a class is full; a freed place is offered to
  the first person, held for a set time, then to the next.
- **Be recognised**: the booking form fills in from the account, and a
  double booking of the same slot by the same person is refused.
- **Message the business** in one thread, answered by the team in the
  workspace.
- **Receive messages about their own orders, bookings and invoices** — in the
  account's thread always, and by email only through the business's own
  connected email provider (DEC-011) and only to the verified email. SMS and
  WhatsApp need a verified phone, which comes with phone sign-in (§6).
  Saroh's own email sends sign-in codes and nothing else.

### Merging and removing

Merging two contacts (DEC-042) with accounts:

- The surviving contact keeps its account. When the survivor has no account,
  the other account moves to it; otherwise the other account is retired
  (`REMOVED`) and its sessions revoked.
- Two accounts never end up on one contact, and a verified value never ends up
  on two accounts.

Removing a customer's details (privacy removal, DEC-042) removes their
account, revokes every session and deletes pending codes. What must be kept
for the law — issued invoices and their bill-to — is kept.

## 3. Options considered

- **One Saroh-wide customer identity** (a person signs in once for every
  business on Saroh). Convenient for a customer of two businesses, but it
  makes Saroh the owner of a cross-business record of who buys where — the
  thing PRODUCT.md says nothing should track. Rejected by the user.
- **Better Auth users with an organization-scoped role.** Reuses the sign-in
  code machinery, but puts customers in the workspace's user table and cookie
  model (shared across `saroh.in` subdomains) — one mistake from a customer
  holding a workspace session. Rejected.
- **Password accounts.** Rejected: small-business customers forget them, and
  a code proves the phone or email the business will message.
- **Magic links.** Rejected as the only way: opening a link on another device
  from the one browsing fails. A code can be typed wherever the email is read.
- **SMS codes now** (Saroh's SMS account, or the business's own provider).
  Set aside on 2026-09-27: email only this round (§6).

## 4. Consequences

- The booking page, the shop and the account area share one session and one
  set of server routes in `apps/saroh.app`.
- A new table family carries customer personal data: every row has
  `organizationId` and RLS, codes and tokens are stored hashed, and request
  logs redact the code, the token and the destination.
- Merchant copy that says "Saroh doesn't message your customers" changes only
  where a message is really sent — through a connected provider, or into the
  account's thread (`saroh-product.md` "Communications").
- The customer site's "Payment: UPI Autopay" and "saved methods" need
  DEC-038 (autopay through the business's provider); until that ships the
  account area shows pay links, never a saved card.

## 5. What this is not

- Not a customer app or push notifications.
- Not social sign-in or passwords.
- Not a way for one business to see another's customers.
- Not a replacement for guest checkout on the invoice pay page.

## 6. SMS and phone sign-in

- **Closed on 2026-09-27: email only for now.** The earlier open question,
  who pays for SMS, is not answered because SMS is not in this round.
- **Phone later, as its own decision.** Phone sign-in, SMS codes and SMS or
  WhatsApp messages to a verified phone come back together, with a new
  decision on who sends and pays, and on the registered sender and template
  Indian transactional SMS needs. Until then no copy offers a phone sign-in or
  promises a text.
