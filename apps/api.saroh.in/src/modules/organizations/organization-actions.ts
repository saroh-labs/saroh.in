/**
 * The closed set of authorizable Organization actions.
 *
 * Its own module because BOTH halves of the authorization system need it and
 * they cannot import each other: `organization-policy.ts` decides with these,
 * and `common/types/organization-context.ts` carries the resolved set on the
 * context. Defining it in either one made the two import each other, which
 * `check:cycles` refuses.
 *
 * This file imports nothing, deliberately.
 */
export type OrgAction =
    | "org:read"
    // Reading the BusinessProfile is DELIBERATELY not part of the `org:read`
    // floor: legal name, tax id and contact email are sensitive business
    // identity, not roster-level facts, so a MEMBER must not see them even
    // though they may see the org exists.
    | "org:settings:read"
    | "org:update"
    | "org:delete"
    | "member:read"
    | "member:invite"
    | "member:remove"
    | "member:role:update"
    | "audit:read"
    | "store:create"
    | "store:read"
    | "store:write"
    | "store:delete"
    // Count and move stock (#513): counts, received/baked/wasted entries,
    // moves between storefronts, undoing them, warning levels. Narrower than
    // `store:write` — prices, names, listings and tracking stay there — and
    // implied by it (`resolveCapabilities`), so whoever changes storefronts
    // can still count.
    | "inventory:write"
    | "site:create"
    | "site:read"
    | "site:update"
    | "site:delete"
    | "project:access:manage"
    | "media:read"
    | "media:write"
    | "section:write"
    | "site:publish"
    // Review (#193). Separate actions because they are separate powers: a
    // REVIEWER may do both and nothing else, while a MEMBER may do neither —
    // leaving a note is not a read, and signing a site off is not an edit.
    | "site:comment"
    | "site:approve"
    | "domain:manage"
    | "form:read"
    | "form:write"
    | "contact:read"
    | "contact:write"
    | "lead:read"
    | "lead:write"
    | "pipeline:read"
    | "pipeline:manage"
    | "activity:read"
    | "activity:write"
    | "notification:read"
    | "notification:write"
    | "service:read"
    | "service:write"
    | "booking:read"
    | "booking:write"
    | "order:read"
    | "order:write"
    // The kitchen (DEC-024, ADR-008): read an order's kitchen view with no
    // money in it, and move its stage or undo the last step. Narrower than
    // `order:read` on purpose — it is what a Member at the counter holds.
    | "order:stage"
    | "discount:read"
    | "discount:write"
    // Product reviews. Named apart from "review", which is site review (the
    // REVIEWER role, site:approve) — the two must never be confused.
    | "product-review:read"
    | "product-review:write"
    | "payment:read"
    | "payment:manage"
    // What a business sells a person on repeat, and the bills for it
    // (ADR-007). OWNER/ADMIN-only: money owed by a named person.
    | "subscription:read"
    | "subscription:write"
    | "invoice:read"
    | "invoice:write"
    // Courses and class packs (ADR-007) — booked time, sold ahead.
    | "course:read"
    | "course:write"
    | "pack:read"
    | "pack:write"
    | "message:read"
    | "message:write"
    | "comms:manage"
    | "consent:read"
    | "consent:write"
    | "automation:manage"
    | "analytics:read"
    | "billing:read"
    | "billing:manage"
    // The health of the external services the org depends on — payments,
    // messaging, domains (#123). Named rather than derived: the surface can
    // say WHICH provider an organization pays through, so it belongs to the
    // roles that manage those relationships, not to everyone who may read.
    | "provider:read"
    // Modular capabilities (ADR-003). `module:read` is the read floor — every
    // role may see effective module availability for the Projects it can access.
    // `module:manage` (OWNER/ADMIN) enables/disables Organization modules and
    // manages Project selection.
    | "module:read"
    | "module:manage";

/** Every action, for exhaustive iteration/testing and building capability sets. */
export const ORG_ACTIONS: readonly OrgAction[] = [
    "org:read",
    "org:settings:read",
    "org:update",
    "org:delete",
    "member:read",
    "member:invite",
    "member:remove",
    "member:role:update",
    "audit:read",
    "store:create",
    "store:read",
    "store:write",
    "store:delete",
    "inventory:write",
    "site:create",
    "site:read",
    "site:update",
    "site:delete",
    "project:access:manage",
    "media:read",
    "media:write",
    "section:write",
    "site:publish",
    "site:comment",
    "site:approve",
    "domain:manage",
    "form:read",
    "form:write",
    "contact:read",
    "contact:write",
    "lead:read",
    "lead:write",
    "pipeline:read",
    "pipeline:manage",
    "activity:read",
    "activity:write",
    "notification:read",
    "notification:write",
    "service:read",
    "service:write",
    "booking:read",
    "booking:write",
    "order:read",
    "order:write",
    "order:stage",
    "discount:read",
    "discount:write",
    "product-review:read",
    "product-review:write",
    "payment:read",
    "payment:manage",
    // ADR-007. OWNER/ADMIN-only — none are in READ_ONLY_ACTIONS: who owes
    // what, and what a person has paid for, is not a roster-level fact.
    "subscription:read",
    "subscription:write",
    "invoice:read",
    "invoice:write",
    "course:read",
    "course:write",
    "pack:read",
    "pack:write",
    "message:read",
    "message:write",
    "comms:manage",
    "consent:read",
    "consent:write",
    "automation:manage",
    // Stage 7 (S7-002/003 analytics reads, S7-005 billing). All OWNER/ADMIN-only
    // — none are in READ_ONLY_ACTIONS: analytics is aggregate business
    // intelligence and billing changes the org's paid plan (money), so a MEMBER
    // sees neither. Public analytics INTAKE (site.view) is unauthenticated and
    // never passes through this policy.
    "analytics:read",
    "billing:read",
    "billing:manage",
    "provider:read",
    // Modular capabilities (ADR-003).
    "module:read",
    "module:manage",
];
