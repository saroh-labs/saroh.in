# ADR-004 — A Site owns a Post (#209)

**Status:** Accepted — 2026-09-04
**Decides:** [#209](https://github.com/saroh-labs/saroh.in/issues/209) — "Who owns a Post? Blogs are bound to a Store"
**Builds on:** [ADR-001](./ADR-001-organization-tenant-root.md) (Organization is the sole tenant root) · [ADR-002](./ADR-002-cms-section-model.md) (the CMS section model and snapshot publishing)
**Precedent:** #164, which moved Sales off the commerce module for the same reason.

---

## 1. Context

A blog backend has existed since the original scaffold: `Post`, `PostCategory`,
`Comment`, their services and controllers, with tests. It is reachable today at
`/stores/:storeId/posts`, and the dashboard lists posts under
`/stores/[storeId]/content`.

Every one of those rows hangs off a **Store**:

```prisma
model Post {
  storeId String
  store   Store @relation(fields: [storeId], references: [id], onDelete: Cascade)
```

So a merchant with a website and no shop cannot write anything. A bakery that
takes bookings and writes about its sourdough has no commerce store, and
therefore no blog. Writing is not a commerce capability, and filing it under one
makes it unreachable for exactly the businesses the platform says it serves.

This is the mistake #164 already corrected for Sales: a thing that is not a
capability was filed under a capability.

## 2. Decision — the Site owns a Post

`Post.siteId` and `PostCategory.siteId`, both required, both cascading from
`Site`. `storeId` is gone from each.

**Not the Store**, for the reason above.

**Not the Organization**, which was the answer for Sales, because a post differs
from a sale in the way that matters here: a post is _published to an audience at
an address_. A sale belongs to the business; a post belongs to the website it
appears on. An organization with two sites — a practice and a side project —
must be able to write for one without the other, and "which site does this post
appear on" would have to be answered by another column anyway. Owning it at the
Site answers that question with the ownership itself.

The consequence the decision was made for: **the dashboard changes**. Posts stop
being a store's content and become a site's, so they are listed and written
under the site, next to the pages they sit beside on the live site. The
`/stores/[storeId]/content` screens move.

### Author

`Post.authorId` pointed at `StoreMembers`, which carried a documented oddity: a
store _owner_ is not a member, so owner-written posts had no author at all. Under
site ownership that indirection has no purpose. `authorId` now points at `User`,
the person who wrote it, and the existing rows are backfilled through
`StoreMembers.userId`.

## 3. Publishing — through the snapshot, per post

Posts publish the way pages do: an immutable `Publication` row per post, using
the model's existing path scoping (`Publication.path`), never live-on-write.

The alternative — a post going live the moment `status` flips to `PUBLISHED` —
would put two publishing rules in one product, and the renderer would need a
second, mutable read path beside the one that reads only immutable snapshots.
That is the invariant the whole module is built on and the one worth keeping:
**the public reads only what publish wrote**.

Per _post_, not per site, and this is the important half: a site-wide snapshot
would mean publishing a post republishes every page, and restoring last week's
site publication would silently unpublish this week's posts. A path-scoped
publication keeps a post's history its own.

`Post.status` and `Post.publishedAt` stay as the draft-side state — what the
merchant sees in the dashboard — exactly as `Page` has draft state beside its
publications.

**This ADR does not build that.** It fixes ownership and the migration, which is
the part that is cheap now and expensive later. The publishing path lands with
the surface.

## 4. The surface is deferred

There is no post editor and no design for one. The editor's design deliberately
excludes it, and the epic records that Content _"stays out until someone decides
what it lists."_ This ADR decides what it lists — a site's posts — and the
screen itself is a follow-up issue.

Until then, the existing list and category screens move under the site and keep
working. They are not the designed surface; they are the surface that exists.

## 5. Migration

One migration, additive-then-narrowing, in this order:

1. Add `siteId` to `Post` and `PostCategory`, nullable.
2. Backfill: a row's `Store` → its `organizationId` → that organization's
   **oldest** `Site`.
3. **Raise if any row is unmapped.** A post whose organization has no site
   cannot be given an owner, and the migration stops with the count rather than
   dropping rows or leaving a required column half-filled. The operator creates
   a site, or deletes the posts, and re-runs.
4. Point `Post.authorId` at `User`, backfilled through `StoreMembers.userId`.
5. `NOT NULL`, foreign keys, `@@unique([siteId, slug])`, indexes; drop
   `storeId` and the old constraints.

Slugs were unique per store and are now unique per site. Two stores in one
organization that each had a post called `/hello` collapse onto one site: the
migration raises on the duplicate rather than silently dropping one.

## 6. Consequences

- A website-only business can write. That is the point.
- `/stores/:storeId/posts` becomes
  `/organizations/:organizationId/sites/:siteId/posts`; authorization stops
  going through `StoresService` and uses the site policy (`site:read` to read,
  `section:write` to write), so posts obey the same rules as the pages they sit
  beside.
- A store is no longer required for content. `ContentModule` drops its
  dependency on `StoresModule`.
- Comments are unchanged: they hang off a post, and a post now hangs off a site.
- The dead `PostData` / `PostMeta` / `mdxSource` stubs in
  `apps/saroh.app/lib/fetchers.ts` are still dead, still imported by nothing,
  and still #107's to delete. Nothing here builds on them.
