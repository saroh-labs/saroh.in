# Data, tenancy and money

> **Read when:** changing `schema.prisma`, adding a model, storing money, writing
> a query that could cross organizations, or shipping a migration.
> Adapted from claude-patterns `backend/03-data-and-migrations.md`. For
> migrations, `.agents/skills/saroh-migrations/SKILL.md` is the authority.

## Tenancy

- **Current** — **Organization is the tenant root** (ADR-001): tenant-owned
  models carry an indexed `organizationId`, and Projects and Teams sit beneath an
  Organization, never as an ownership root. **Adopted** — for every model. Gap:
  `Customer` is store-scoped and its `organizationId` is still nullable.
- **Current** — **Row-level security is defence in depth** (PRODUCT_STRATEGY
  §25). `OrgRlsInterceptor` sets `app.current_organization_id` for org-scoped
  requests through the RLS-aware `prisma` proxy; enforcement is switched by
  `RLS_ENFORCEMENT`, and rollout state is in
  `docs/architecture/RLS_ROLLOUT_AND_OPS.md`. Application filters stay mandatory.
- **Current** — **Every new table gets the `org_isolation` policy in its own
  migration** (ENABLE, FORCE, the empty-string-safe predicate; through the
  parent for a child table with no `organizationId`), or an entry in
  `NOT_TENANT_OWNED` with the reason it isn't business-owned.
  `packages/database/src/rls-coverage.test.ts` fails otherwise (#53). Sixteen
  tables slipped through before that test existed.
- **Current** — **Inside an org context, `$transaction([...])` takes only
  operations made through `prisma` in that same context.** Under
  `RLS_ENFORCEMENT` they are lazy and run in one GUC'd transaction; a promise
  from anywhere else is refused. `TEST_RLS=on` runs the integration suite the
  way enforcement will (#53).
- **Current** — **A uniqueness check across businesses reads outside the org
  context.** "Is this slug or address free" must see every business's rows,
  but under `RLS_ENFORCEMENT` the request's `tx`/`prisma` sees only the
  caller's, so another business's row looks free and the insert ends in the
  unique index's raw error. Web addresses go through `addressUse()`
  (`sites/site-address.ts`), which uses `outsideOrgContext` only when
  enforcement is on and a context is active. (Store slugs had the same
  check until L14 stopped writing them.) Never a `tx.<model>.findUnique`
  on a globally unique column. Prove it under `TEST_RLS=on`.
  The same goes for any read that spans one person's businesses — the
  businesses a billing profile's owner owns (`ownedBusinessIds`,
  `billing/billing-customer.ts`): Membership is isolated per business, so
  in a checkout's context only that business's membership is seen. A job
  runs with no context, so prove it on a path scoped to one business.
- **Current** — **Read a lost serializable race with `isSerializationFailure()`**
  (or `prismaErrorCode()`, `apps/api.saroh.in/src/common/prisma-errors.ts`),
  never `code === "P2034"`. Through the pg driver adapter it can arrive with no
  code, and the booker got a 500 instead of "fully booked" (#106).
- **Current** — **Publications are immutable,** and the public renderer reads only
  them (ADR-002). No draft table is ever on the public read path.
  **A public write that depends on what the site shows reads the publication
  too.** An enquiry submission is validated against the form fields in the
  current snapshot, not the `Form` row the editor rewrites on every autosave
  (#281). Validating against the draft let an unpublished edit refuse live
  visitors.
- **Current** — **Disabling a capability never deletes data;** deactivation runs a
  policy (§25, ADR-003).
- **Current** — **Catalogue settings belong to the business** (#529, ADR-010):
  categories, options, custom fields, defaults, allergens and the SKU pattern
  are keyed by `organizationId`, with category slugs, option names and
  defaults keys unique per business. Their `storeId` column is the storefront
  a row was first made at and is never read. Services take the organization;
  `CatalogueAccess` resolves it from an org route (`store:read` /
  `store:write`) or, for the old `stores/:storeId/...` aliases, from the
  storefront under its own access rules.
- **Current** — **A product belongs to the business; a storefront sells it
  through a listing and counts it in `StockLevel`** (#510, ADR-010).
  `Product.organizationId` is required and slugs are unique per business;
  `Product.storeId` is only where it was first made. `ProductListing` (and
  `ProductListingVariant` for the variants sold there) says where it sells;
  store-route reads go through it (`listedAt`). Stock is one `StockLevel` row
  per storefront × product × variant (variant null: counted as a whole),
  behind two partial uniques — find it under a row lock and create it, never
  upsert. An order line records its row (`stockLevelId`), what it holds
  (`heldQuantity`) and what it took off the shelf when fulfilled
  (`soldQuantity`); every hold, sale, release and return reads those under
  the row's lock (`stock/reserve.ts`, #511 — see
  `backend-billing-and-classes.md`). Lock order: Order → BusinessProfile
  (FOR SHARE, when Track stock is read under a lock) → Product (a change to
  how it counts; several at once in id order, in one statement) →
  StockLevel rows by id (`products/stock-levels.ts`). **A product is locked
  FOR NO KEY UPDATE, never FOR UPDATE:** every insert that names a product
  (a StockEntry, an OrderItem) takes FOR KEY SHARE on it for the foreign
  key, after the StockLevel locks it already holds. FOR UPDATE conflicts
  with that, so a count opening a new shelf deadlocked with a sale on the
  product's other shelf (PR #533 review). Deleting a product keeps the same
  order: NO KEY UPDATE, then its shelves, its checks under those locks, its
  collection memberships, listings and shelves deleted explicitly, and the
  product last (a lock conflict left over is a 409 to try again). Only the
  merge's loser, deleted with the API stopped, takes FOR UPDATE first.
  NO KEY UPDATE holds only while nothing the transaction writes to the
  product touches a key column (next rule).
  Whether a product counts stock is `Product.stockTracked` and the
  business's `BusinessProfile.stockTracking` (#515), not whether it has a
  row: an untracked product keeps its rows at 0 for the log, so every
  reader filters with `COUNTING_ROWS` (`stock/tracking.ts`). An untracked
  product has no count and sells unless a storefront marked it sold out by
  hand (`ProductListing.soldOutAt`, `stock/sold-out.ts`): `reserve.ts`
  refuses a fresh line for it there as it refuses a counted Sold out, and
  turning tracking on clears it. `Inventory` and
  `VariantInventory` are no longer written. Every new table pairs its ids
  with composite keys — (storeId, organizationId), (productId,
  organizationId), (variantId, productId) — so the database refuses a row
  mixing two businesses.
- **Current** — **A row lock is taken at the strength of the write that
  follows it** (release review of DEC-071, `sites/live-pointer.ts`).
  Postgres takes an UPDATE that sets a key column — the primary key or any
  column in a unique index, such as `Site.currentPublicationId` or
  `Site.subdomain` — as a key update, which needs FOR UPDATE; any other
  UPDATE needs only FOR NO KEY UPDATE. Lock FOR NO KEY UPDATE first and then
  write a key column, and the lock is upgraded mid-transaction: it waits on
  every FOR KEY SHARE (an insert naming the row, for its foreign key) while
  already holding a lock, and deadlocks (40P01) with a transaction that
  inserted a child and then writes the row, as a web-address change does.
  So: FOR UPDATE when the transaction will set a key column of the row;
  FOR NO KEY UPDATE (which lets those inserts through) only when none of
  its writes to the row does. Pinned for the site by
  `live-pointer.db.spec.ts`. **Lock order for a site: Organization, then
  Site.** `lockSite` takes the business's row FOR KEY SHARE before the Site
  FOR UPDATE, because a web-address change holds the Organization FOR
  UPDATE and then needs the Site; anything new that locks a Site and then
  inserts a row naming the business goes through `lockSite`. A serializable
  transaction that waited behind such a lock fails its snapshot (40001)
  without having lost anything, so it runs again before reporting a lost
  race (`WebAddressService.change`).
- **Current** — **An order's number comes from `nextOrderNumberInTx`, in the
  order's transaction** (DEC-066, P3). One `ORD-` series per business across
  its storefronts, counted in `OrderNumberSequence`; never `count + 1`, which
  gave each storefront its own ORD-001. A seed that writes fixed numbers calls
  `alignOrderNumberSequence` after. `@@unique([storeId, orderId])` is still
  the only unique index: the per-business one is the contract step.
- **Current** — **An order line bills a product or a service, never both**
  (DEC-050, round-2 E9). `OrderItem.productId` is nullable beside
  `serviceId`, and `OrderItem_bills_one_thing` CHECKs exactly one. A
  service line is a treatment sold as one order (Appointment type): quantity
  1, `stockRow` NONE, no variant, GST from the Service. Read a line's name
  and kind through `orders/order-line.ts` (`lineName`, `lineKind`,
  `PRODUCT_LINES` for stock, reviews and discounts), never `item.product`
  alone. Its visits are bookings (`Booking.orderId`, `visitNumber`, one live
  booking per visit by the partial unique `Booking_one_live_visit`), and a
  visit never refunds on its own: visit 1's pay-now invoice names the order
  (`treatment-ledger.ts` counts its payments as the order's), so
  `bookingPaymentInTx` never finds it. `bookings/visits.ts` sells and books
  them.
- **Current** — **A new shelf never changes how a product counts** (#513,
  PR #533 review). `stock.service` makes a missing row only under the
  product's lock, re-reads Track stock there, and refuses (409) a variant's
  row for a product counted as a whole, or a whole row for one counted per
  variant. A product with no shelf yet may start with either kind. Switching
  to per-variant stock is `setVariantsIn` alone: it moves open lines'
  `heldQuantity` (never their quantity) and needs `store:write`. **The log
  keeps its history:** a variant with real history — a line that sold or
  holds it, or an entry a person or an order wrote that moved stock and
  wasn't undone — can't be removed (archive the product instead). Saroh's
  own entries and counts that changed nothing aren't history, so such a
  variant goes; the last variant counting anywhere hands what it held
  back to the product at each storefront (`VARIANT_REMOVED`), and one with
  units anywhere while another variant still counts at any storefront is
  refused, since they'd be lost (never a whole shelf beside variant ones:
  a storefront can sell only some variants). A product
  with any stock entry, or stock on a
  shelf, can't be deleted either (archive it). A COUNTED
  entry Saroh wrote (`StockEntry.system`: Track stock off, the per-variant
  switch, a removed variant) is never undone. A return recorded by hand
  that names an order counts against that order's refund put-backs
  (`orderReturnableOnRow`).
- **Current** — **A collection is the business's, hand-picked or automatic,
  never both** (#516, DEC-031). `Collection` carries a required
  `organizationId`. A hand-picked one lists its products in
  `CollectionProduct` rows ordered by `position`, 500 at most
  (`COLLECTION_PRODUCTS_MAX`, checked on every add and save, under the collection's lock). An automatic one sets
  `categoryId`, and its products are read from that category and the ones
  below it when asked, never stored, so it can't be edited by hand. A
  category an automatic collection uses can't be deleted: the service
  names the collection, and the `NoAction` key refuses it too. Composite
  keys tie a membership's collection and product, and a collection's
  category, to one business. Archived products show in neither kind. A
  product merge (#530) moves its memberships.
- **Current** — **A location uses the business logo unless it has its
  own** (DEC-123). `Store.logo` and `Store.logoMediaId` follow the business
  logo's shape (`BusinessProfile.logoUrl`, `logoMediaId`); both null means
  the business's. Read a location's logo through `stores/location-logo.ts`
  (`locationLogos`: own, the business's, the one to show), never
  `store.logo` alone, which is null for most locations. Paper keeps the
  business logo (DEC-082).
- **Current** — **A backfill that merges rows is a TypeScript script** in
  `packages/database/src/backfill/`, exported so the integration suite can seed
  old-shape rows, run it twice and check the second run changes nothing
  (`catalogue-settings.ts`). The migration that depends on it refuses to run,
  before changing anything, while its precondition fails.
- **Current** — **A row's `promised` is the sum of its open lines'
  `heldQuantity`; a closed order's lines hold nothing** (#511). Anything that
  writes lines or rows outside `stock/reserve.ts` — a backfill, a seed —
  keeps it or is checked against it (`backfill/held-stock.ts`):
  `heldStockMismatches` lists breaks (the showcase check and the base seed
  stop on one), seeds make open orders hold with `holdOpenLines` (on hand
  rises by what is held, so what a row can sell stays the seeded number;
  like reserve, a line whose product counts no stock (#515) holds nothing),
  and `reconcileHeldStock` repairs: lines holding more than their row
  promised are capped oldest order first, the rest become `stockRow` NONE;
  a row promising more is only reported (Stock checks shows it). The #510
  backfill runs it last; `held-stock.cli.ts [--dry-run]` runs it alone.
- **Current** — **Joining two rows re-points everything first, then proves
  nothing is left** (#530, `merge-same-products.ts`): a product merge moves
  order lines, shelves, listings (with a hand-marked Sold out), hand-picked
  collections, reviews, photos, codes, field values and
  allergens onto the survivor, counts what still names the loser, and throws
  — rolling back the business — rather than let a cascade delete it. A merge
  that would widen a live discount's reach is skipped. What a backfill tells
  a business goes in the audit stream (the full report, read with
  `audit:read`) plus one notice in the Owner/Admin inbox, so it is seen
  without a banner to build and dismiss.

- **Current** — **A contact's email can be a reserved placeholder; read it
  through `contacts/contact-email.ts`** (DEC-049, round-2 A1).
  `Contact.email` is required and unique per business, so a contact that
  must not hold a real address carries `account+<id>@account.invalid` (a
  site account's separate contact), `merged+<id>@removed.invalid` (a merge's
  retired contact) or `removed+<id>@removed.invalid` (privacy removal). Build
  them only with that module's `reserved*Email`, test with
  `isReservedContactEmail`, and show `contactEmailForDisplay`, which gives
  the linked account's email or nothing. Never send to, pair on or show a
  placeholder. A site account (`CustomerAccount`, ADR-011) is live in every
  status but REMOVED: a MERGED one keeps its email reserved in the partial
  unique index.
- **Current** — **A merged contact is a tombstone, and a late writer goes
  through `resolveContact`** (DEC-042, round-2 C9). A merge
  (`customer-workspace/merge.service.ts`) never deletes the other contact:
  it keeps its id with `mergedIntoId` pointing at the survivor (one hop; a
  merge re-points older tombstones) and no personal values. Any write that
  takes a contact id from outside the request's own reads — a webhook, a job
  payload, a session's account, a token, a page loaded earlier — calls
  `resolveContact(tx, contactId, organizationId)` in its transaction and
  writes against the returned id; its `FOR SHARE` waits on the merge's
  `FOR UPDATE`, so the write lands before the merge (and is moved) or after
  it (on the survivor). Lists and search leave tombstones out
  (`mergedIntoId: null`). Every relation to `Contact` needs a rule in
  `merge-plan.ts` `MERGE_RULES`; `merge.relations.spec.ts` fails a new one
  without.
- **Current** — **A write that can race is guarded where it lands, and
  its spec runs the race.** Read-then-write by id at Read Committed
  re-checks only the id after a lock wait: lock the row first
  (`FOR UPDATE`), or guard the write on the state read (`updateMany where
{ id, status: "WAITING" }`) and act on `count`. A save re-reads its row
  under the lock and writes only the columns it changes; an Undo answer
  (`previous`) carries only those. A replace (deleteMany + create) takes a
  `pg_advisory_xact_lock` on its key. In a Serializable transaction the
  snapshot predates any lock taken inside it, so a Read Committed writer's
  commit stays invisible: read again on a connection of its own
  (`outsideOrgContext`, since the ambient client joins the transaction)
  and retry (`bookings/phone-booker.ts`). Specs hold one writer on the
  lock in a test transaction, or `Promise.allSettled` the two
  (DEV_LEARNINGS, 19 Oct 2026).
- **Current** — **A privacy removal anonymises in place; a new personal
  field needs a rule** (DEC-042, round-2 C11). "Remove their details"
  (`customer-workspace/privacy-removal.service.ts`) keeps the contact row
  (`removedAt`, the `removed+<id>@removed.invalid` placeholder, no name,
  phone, company or address) so every key to it holds, and scrubs the
  person wherever else they live: store customers only they hold, their
  orders' recipient and note (never `deliveryState`, the place of supply),
  messages, review invitations and reviews, bookings' booker details and
  snapshot. Issued invoices keep their bill-to; leads and form entries are
  the CRM's and stay. Autopay is cancelled at the provider first through
  D20's `cancelFor` (`payments/mandate-gate.ts`), and nothing changes while
  the provider hasn't confirmed; a contact's hard delete asks the same gate.
  Lists and search leave a removed contact out (`removedAt: null`,
  `notRetired`). Every relation to `Contact` needs a rule in
  `privacy-removal-plan.ts` `REMOVAL_RULES` too (`merge.relations.spec.ts`),
  and every personal-looking field on a model reachable from `Contact` or
  `Customer` needs an entry in `personal-data.ts` — a rule, or "kept" and
  why (`personal-data.spec.ts`).
- **Current** — **What a removal keeps is decided again for a deleted
  business** (DEC-122). 180 days after a business is deleted,
  `organization.retention.erase` runs the privacy removal's own writes for
  every contact, then erases what no single removal reaches (store
  customers with no contact, a walk-in's name on an order) and the CRM a
  removal leaves to the business. So a field marked "kept" in
  `personal-data.ts`, or a relation `REMOVAL_RULES` keeps, also needs a
  decision in `admin/retention-erase-plan.ts` (`KEPT_FIELD_DECISIONS`,
  `KEPT_RELATION_DECISIONS`): erased at 180 days, or kept and why
  (`retention-erase-plan.spec.ts`). Invoices, credit notes and an order's
  lines, amounts and place of supply are never erased (ADR-008). A new
  table holding a person's details that hangs off neither `Contact` nor
  `Customer` adds its write to `retention-erase-writes.ts` and its line to
  `RETENTION_ERASED`.

## Money — **Current**

- `Decimal` with explicit precision (`@db.Decimal(10, 2)`, `@db.Decimal(12, 2)`);
  never `Float` or `Int` for currency.
- **The invoice ledger counts in integer paise** (DEC-173, #1113): the one
  exception to "never `Int` for currency", as `PaymentIntent.amountCents`
  already was. `InvoicePayment.amountCents` is one payment;
  `Invoice.paidCents` caches the sum of the live ones (not removed, not
  bounced), is recomputed from the rows in the same transaction as every
  ledger write, and is written nowhere else (the showcase check pins it).
  The invoice's own money columns stay `Decimal(12,2)` and amounts still
  travel as strings. What is left to pay is `leftToPayCents`
  (`invoices/invoice-state.ts`), the one place it is worked out. A payment
  is never deleted: one recorded by mistake is removed softly
  (`removedAt`). An order's invoice has no rows; the order is its ledger
  (ADR-008). The migration's CHECKs hold the shape (an amount above 0, a
  known method, a bank status only and always on a cheque); they exist
  only where migrations ran, so prove them under `TEST_RLS=on`
  (`rls/invoice-payments-rls.db.spec.ts`).
- **Strings across the wire.** Frontend types say `price: string`, and
  `common/money.ts` `toMoneyString` formats with string operations only.
- **The API computes.** Order totals are summed in integer cents server-side
  (`orders.service.ts`), and a payment's amount derives from the Order, never
  from the client. Client arithmetic is for previews and sort keys only.
- **A stored price says which price it is.** `Product.price` and
  `Service.priceCents` are what the business typed. `OrderItem.price` and a
  booking's `snapshot.service.priceCents` are the amount to pay for one,
  fixed at the sale: the typed price, or with GST added where the business
  chose that (`invoices/gst-price.ts`, the only place the two are turned
  into each other; `backend-billing-and-classes.md` → How a price carries
  GST). The line keeps what was typed and the mode (`listPrice`,
  `gstPriceMode`), null when no GST was charged. Never recompute a sold
  line's price from the product, and never read the business's choice to
  explain a line already sold.
- **A stored amount is the amount to pay; a paper may read it before GST.**
  `InvoiceLine.unitPrice` and `amount` are GST and all on every line, and
  nothing rewrites them. A line GST was added to prints the typed price as
  its rate and its frozen taxable value as its amount
  (`invoices/added-line.ts`, the only place that reading is made, from the
  line's own frozen sums). Never print quantity × rate as an amount: the
  frozen taxable value is what the totals use, and the two can differ by
  under half a paisa a unit (`backend-billing-and-classes.md` → A paper
  prints the typed price).
- **An MRP includes its taxes** (12 Oct 2026: "GST is part of MRP").
  `Product.mrp` and `ProductVariant.mrp` (null: the product's) are compared
  with the amount to pay for one, GST and all, never with the typed
  `price`: under "GST is added" a ₹1,000 price at 18% needs an MRP of
  ₹1,180 or more. The comparison is `products/product-rules.ts` and nowhere
  else; every write of a price, an MRP, a rate or a price mode on a product
  or a variant goes through it, and so does the business's own switch
  (`backend-billing-and-classes.md` → GST is part of MRP). A saving is the
  MRP less the amount to pay, served by the API (`saving`) and null when
  there is none.
- **A change to what something costs is recorded where it is made** (owner,
  12 Oct 2026: "Prices for products should have history"). A product, a
  product's option, a service and a course keep a price history: the typed
  price, the MRP (a product's and an option's), the GST rate and "GST on
  this price", each as it was and as it became, with who changed it and
  when. Any code that writes one of those columns calls `recordPrices`
  (`audit/price-history.ts`) **on the same transaction as the write**, with
  the row's facts before and after (`productFacts`, `optionFacts`,
  `serviceFacts`, `courseFacts`), so a save that fails or is refused leaves
  no entry and a save that moves nothing writes none. A write with no
  transaction of its own gets one.
    - **Where it is kept:** the audit stream, no table of its own.
      `price.set` is an item's first entry (made, copied or imported at
      these values); `price.changed` is every later one. The target is the
      item (`product`, `service`, `course`); an option's entry is on its
      product and names the option. Metadata holds the kind, the name, the
      currency, how it was made (`source`) and `changes`
      (`{ field, before, after }`, the settings saves' shape). An
      operator's is marked by `auditMetadata` and reads as Saroh support.
    - **One entry, one shape.** The rates sheet (`gst-rates.service.ts`)
      writes `price.changed` like an editor does. It used to write
      `gst-rate.set` with one `from` and `to`: that action is no longer
      written, and rows already written are read into the same shape
      (`changesOf`, and the app's Activity).
    - **The price is the one typed.** History never works out an amount to
      pay and never reads the business's setting, so a line reads the same
      whatever "GST on your prices" says today. The business-wide switch is
      one settings change (`profile.update`), never an entry per item.
    - **Read per item** with the permission its own page asks for
      (`store:read`, `service:read`, `course:read`), scoped to the business,
      newest first, a page at a time (`readPriceHistory`, behind
      `GET …/products|services|courses/:id/price-history`). It filters the
      stream by business and target on `[organizationId, createdAt]`, as
      the customer timeline does.
    - **Plans and class packs are not written here:** they keep their own
      histories (`SubscriptionPlanEvent` `PRICE_CHANGED`, `PackEvent`).
    - A new write path is pinned by a spec beside it
      (`products.price-history.spec.ts`, `service-price-history.spec.ts`,
      `imports.price-history.spec.ts`, `price-history.db.spec.ts`).
- **Plans, class packs and courses** (12 Oct 2026). `SubscriptionPlan.price`,
  `ClassPack.price` and `Course.price` are what the business typed, each
  with its own `gstRate`, `sacCode` and `gstPriceMode`. A
  `CustomerSubscription.price` is the typed price the member joined at and
  is never rewritten with GST: every period's invoice works the amount to
  pay out again from it and the plan's GST as it stands that day
  (`invoices/sale-price.ts`), which is how a rate set today reaches a
  member's next renewal while no invoice already issued changes. A
  `PackPurchase.price` and a `CourseEnrollment.price` are one-off sales, so
  they hold the amount paid, GST and all, as an order line does. The
  invoice line freezes the rate and the mode either way.
- **A customer's sum is the API's.** A public read that shows a price about
  to be paid serves the GST in or on it and the amount to pay
  (`GstOnPrice`); the site formats and never adds, multiplies or rounds.
- **One figure, one kind** (12 Oct 2026). Every money figure a business
  reads is one of two kinds, and says which. It matters only where GST is
  added to a price: where it is included, or the business is not
  registered, the two are the same to the paisa and nothing reads
  differently.
    - **Money taken, owed or expected is the amount the customer pays, GST
      and all:** what a member pays a period, "a month from members",
      takings, a total, due, paid, a renewal still to come, a to-pay amount.
      Never sum or show a typed column (`CustomerSubscription.price`, a
      plan's, pack's, course's or service's price) as money. A sum over a
      stretch of time is the sum of what was actually charged
      (`PackPurchase.price`, `CourseEnrollment.price`, `Invoice.total`,
      `Order.total`, a booking's snapshot): never re-derive an old amount
      from today's setting.
    - **A price the business set is the typed price, and says so where GST
      comes on top:** "₹2,000 + GST" in its own price list
      (`setPriceWords`), or the whole sum where there is room, "₹2,000 +
      ₹360 GST (18%) = ₹2,360 to pay" (`addedSum`, the desk dialogs' words).
      An editor says the sum under the price as it is typed.
    - **Two figures compared are the same kind, both amounts to pay:** a
      class in a pack against a class alone, plans in a picker, "keeps
      ₹1,770, the plan is ₹2,360", a purchase against the pack's price
      today (`paidAtPrice`: what was paid matches a price when it is that
      price or that price with its GST on top, so a sale is never "an older
      price" only because GST is added).
    - **The API serves both, one place each.** A merchant read of a plan, a
      pack, a course or a service carries `gst` (`GstOnPrice`, from
      `saleCharge` or `serviceCharge`: the typed price, the GST and the
      amount to pay as it is charged today). A subscription carries `pay`
      beside `price`, by the sum its next invoice uses, and a plan's
      `byPrice[].pay` and `monthlyFromMembers` are worked from it
      (`plan-figures.ts`). The calendar's renewal to come and the customer
      page's Subscriptions tab read the same sum. The diary's price of a
      booking is its snapshot's. The public packs read serves both sides of
      "a class instead of" as amounts to pay (`payEach`, `singlePay`).
    - **The app formats and never works one out**
      (`apps/app.saroh.in/lib/gst/on-price.ts`: `payOf`, `setPriceWords`,
      `addedSum`, `paidAtPrice`). The preview mirror
      (`lib/gst/price-mode.ts`) is only for a price being typed in an
      editor or a desk dialog, before the API has answered.
    - **A new money figure picks its kind before it is drawn,** and a new
      read of something priced serves `gst` with the price.
    - **Left as typed, on purpose:** a history line ("subscribed at
      ₹2,000", a price change) records the price that was set, and no mode
      was recorded with it. The "Download your data" files keep the stored
      columns, and their README says which price each file holds.

## Modelling

- **Current** — IDs are `cuid()` (all 86 in `schema.prisma`).
- **Current** — **Configuration an operator changes lives in tables with a UI,**
  not environment variables: `FeatureFlag`, `FeatureFlagOverride` and
  `FeatureFlagAudit`, `Plan`, `Subscription`, `OrganizationModule`.
- **Current** — **Derived values are recomputed, not mutated.** An order's total
  is a point-in-time fact recorded once; analytics rollups are rebuilt with
  absolute upserts, so a re-run is safe.
- **Current** — **Cross-domain views are read models, not rewrites.** Home
  aggregates per source instead of reshaping the domains (PRODUCT_STRATEGY §25);
  do the same for Sales-style views.
- **Adopted** — **Ask what the data is** before deciding where it lives. Don't put
  structured data into an existing JSON column because the column is there.
- **Current** — Enum-like values in code are `as const` arrays with a derived
  type.

## Migrations

- **Current** — A migration must replay onto an empty database and match
  `schema.prisma` exactly: `pnpm --filter @saroh/database db:verify:replay` (CI:
  `migration-replay`; PRODUCT_STRATEGY §28).
- **Current** — The integration suite uses `prisma db push` and never runs a
  migration file, so it cannot tell you a migration works.
- **Current** — `packages/database/src/database-target.ts` refuses targets that
  are not allow-listed; name a throwaway one with `DATABASE_TARGET_CONFIRM`.
- **Adopted** — **A destructive change ships in two deploys:** code that tolerates
  both shapes, then the schema change. Not written down anywhere before this
  file.
- **Adopted** — **Migrations run before the new image serves traffic.** Gap: not
  wired. The API image's `CMD` only starts the app, and `RLS_ROLLOUT_AND_OPS.md`
  §2 lists wiring `db:migrate:deploy` into deployment as an open follow-up.

## Seed — **Current**

`pnpm --filter @saroh/database db:seed` lays down "Northwind Supply". Seeded data
can hide a missing producer: analytics rollups existed locally only because the
seed wrote them, long before anything scheduled them (DEC-075).
