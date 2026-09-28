import { ForbiddenException } from "@nestjs/common";

import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import { ORG_ROLES } from "../../common/types/organization-context";
import type { OrgAction } from "./organization-actions";
import { ORG_ACTIONS } from "./organization-actions";

/**
 * Centralized Organization authorization policy (S1-003).
 *
 * This module is the SINGLE source of truth for "which Organization role may
 * perform which action". It is deliberately framework-agnostic and pure (no
 * Nest DI, no Prisma, no request) so it is trivially unit-testable and so role
 * checks are never scattered as ad-hoc `role === "OWNER"` strings across
 * handlers. Handlers ask `authorize(ctx, action)`; the policy decides.
 */

/**
 * The closed set of authorizable actions. Grouped by resource with an explicit
 * read/write/manage split so the capability map below reads unambiguously:
 *
 *  - `org:*`     — the Organization itself (settings, deletion).
 *  - `member:*`  — the Organization's membership roster.
 *  - `audit:*`   — the Organization's immutable audit stream (S1-009). Reading
 *                  it is OWNER/ADMIN-only: it is NOT in READ_ONLY_ACTIONS, so a
 *                  MEMBER cannot see it (audit trails leak who-did-what).
 *  - `store:*`   — Organization-owned commerce channels (Stores).
 *  - `site:*`    — Organization-owned publishing properties (Sites, S2-003).
 *                  `site:read` is in the read-only floor (OWNER, ADMIN and
 *                  MEMBER may list/read the org's sites). A REVIEWER holds it
 *                  too, but `SiteReviewer` narrows it to the sites they were
 *                  invited to (#276) — see `sites/site-access.ts`. `site:create` /
 *                  `site:update` / `site:delete` are OWNER/ADMIN-only: they are
 *                  NOT in READ_ONLY_ACTIONS, so a MEMBER cannot create or mutate
 *                  a site. (Widening authoring to MEMBER later — so contributors
 *                  can edit their own sites — is a one-line change to
 *                  READ_ONLY_ACTIONS / CAPABILITIES; the default here is the
 *                  least-privilege choice.)
 *  - `project:*` — Projects, Teams, and project-level access grants (S1-010).
 *                  `project:access:manage` (create/delete Projects & Teams,
 *                  grant/revoke project roles, manage team membership) is
 *                  OWNER/ADMIN-only: it is NOT in READ_ONLY_ACTIONS, so a MEMBER
 *                  cannot alter who can reach which Project.
 *  - `media:*`   — Org-owned uploaded media (S2-008). `media:read` is in the
 *                  read-only floor (every role, including MEMBER, may list
 *                  media). `media:write` (issue an upload URL, confirm/complete
 *                  an upload, delete an object) is OWNER/ADMIN-only: it is NOT in
 *                  READ_ONLY_ACTIONS, so a MEMBER cannot mint upload URLs or
 *                  delete objects. (Widening `media:write` to MEMBER later — so
 *                  contributors can attach their own images — is a one-line
 *                  change to READ_ONLY_ACTIONS / CAPABILITIES if the product
 *                  wants it; the default here is the least-privilege choice.)
 *
 *  - `form:*` / `contact:*` / `lead:*` / `pipeline:*` / `activity:*`
 *                — the enquiry funnel + CRM (Stage 3 — S3-001). ALL are
 *                OWNER/ADMIN-only except `contact:read`, which the floor
 *                gained with the diary (a Member sees who is booked); a
 *                MEMBER still cannot read leads or the pipeline. This is the
 *                least-privilege default — CRM rows are customer PII and sales
 *                data (the same reasoning as `audit:read`). Note: the PUBLIC
 *                enquiry submission (S3-002) is UNAUTHENTICATED and org-agnostic
 *                — it is NOT one of these actions and never passes through this
 *                policy. Widening any CRM read to MEMBER later is a one-line
 *                change to READ_ONLY_ACTIONS.
 *
 * Add new actions here and to CAPABILITIES; TypeScript then forces every role
 * to make an explicit allow/deny decision (the map is keyed by the union).
 */
export { ORG_ACTIONS } from "./organization-actions";
export type { OrgAction } from "./organization-actions";

/**
 * Read-only actions — the floor OWNER, ADMIN and MEMBER share.
 *
 * NOT every role: REVIEWER is enumerated separately below and deliberately does
 * not get this floor (#276). The floor includes the roster, the stores and the
 * media library, which is not what inviting someone to look at one site means.
 */
const READ_ONLY_ACTIONS: readonly OrgAction[] = [
    "org:read",
    "member:read",
    "store:read",
    // Reviews are about products, which the floor already sees. Reading them
    // is not replying to, hiding or inviting them (product-review:write).
    "product-review:read",
    "site:read",
    "media:read",
    // Every role may read effective module availability (ADR-003); managing
    // modules requires the separate OWNER/ADMIN `module:manage` action.
    "module:read",
    // The diary and who is on it (DEC-019 follow-up, 2026-09-22): a
    // receptionist or a doctor on the team sees the appointments, the
    // services they are for, and the people booked — without leads,
    // pipeline or anything to do with money.
    "booking:read",
    "service:read",
    // Phone and email are part of the person (matrix §3): no separate key.
    // Sensitive Needs attention is `customer:sensitive`, never on the floor.
    "contact:read",
];

/**
 * What a MEMBER holds beyond the read-only floor (DEC-024, amends DEC-020):
 * the kitchen. Someone at the counter reads an order's kitchen view — items,
 * stage, notes, who it is for, never money — and moves its stage. Taking,
 * changing, refunding and exporting orders are `order:create`, `order:edit`,
 * `order:refund` and `order:export` (B16), which a Member does not hold; the
 * Member default bundle is F18's to change.
 *
 * Kept apart from the floor because it is a write: the floor is what every
 * reading role shares, and this is one narrow thing a Member may DO.
 */
const MEMBER_ACTIONS: readonly OrgAction[] = ["order:stage"];

/**
 * Role → allowed actions.
 *
 * Rationale (ADR-001 role vocabulary):
 *  - OWNER  — full control of the tenant, including irreversible org deletion.
 *  - ADMIN  — day-to-day operator: manages members and stores, edits org
 *             settings, but MAY NOT perform the destructive org-level action
 *             `org:delete`. (Guarding the "last OWNER" — i.e. an ADMIN must not
 *             be able to demote/remove the final OWNER via member:role:update /
 *             member:remove — is a data-integrity invariant enforced at the
 *             write layer, S1-006; it is not expressible as a coarse
 *             role→action capability. It IS enforced now: `assertNotLastOwner`
 *             in `organization-members.service.ts` (#276), inside a
 *             serializable transaction.)
 *  - MEMBER — read-only: can see the org, its roster, its stores, and the
 *             diary (bookings, services, contacts), and sees no money. The
 *             one thing it may change is an order's kitchen stage
 *             (`order:stage`, DEC-024).
 *  - REVIEWER — website only, and narrower than MEMBER rather than beneath it.
 *             Its three actions are enumerated in CAPABILITIES below, and
 *             `SiteReviewer` narrows them to named sites (#276).
 *
 * Sets are frozen-by-construction (never mutated after build) so a leaked
 * reference can't widen a role's capabilities.
 */
const CAPABILITIES: Record<OrgRole, ReadonlySet<OrgAction>> = {
    OWNER: new Set<OrgAction>(ORG_ACTIONS),
    ADMIN: new Set<OrgAction>(
        ORG_ACTIONS.filter((action) => action !== "org:delete"),
    ),
    MEMBER: new Set<OrgAction>([...READ_ONLY_ACTIONS, ...MEMBER_ACTIONS]),
    /*
     * REVIEWER — website only (#193), and the narrowest role in the system.
     *
     * Enumerated explicitly rather than derived from READ_ONLY_ACTIONS. A
     * reviewer is brought in to look at ONE site, and the read-only floor
     * includes the org's roster, its stores, its products and its bookings —
     * everything a small business would not hand to the person checking their
     * copy. Deriving this set would mean every future addition to the floor
     * silently widened what a reviewer can see.
     *
     * `site:comment` and `site:approve` are what they are here to do.
     * `section:write` and `site:publish` are absent by design: a reviewer says
     * what they think, the owner decides.
     */
    REVIEWER: new Set<OrgAction>(["site:read", "site:comment", "site:approve"]),
};

/** Pure predicate: may `role` perform `action`? */
export function can(role: OrgRole, action: OrgAction): boolean {
    return CAPABILITIES[role].has(action);
}

/**
 * Enforce the policy for a resolved Organization context. Throws
 * `ForbiddenException` (mapped to 403 by the global filter) when the actor's
 * role does not permit `action`; returns silently when it does.
 */
export function authorize(ctx: OrganizationContext, action: OrgAction): void {
    if (!allows(ctx, action)) {
        throw new ForbiddenException(
            `Role "${ctx.roleKey ?? ctx.role}" may not perform "${action}"`,
        );
    }
}

/**
 * Whether this actor may take this action.
 *
 * Prefers the permissions RESOLVED for the organization's own role, because a
 * business can invent roles and the shipped map knows nothing about them.
 * Falls back to that map when a context was built without them — every unit
 * test and every caller written before roles became rows — so nothing that
 * does not set `actions` changes behaviour.
 */
export function allows(ctx: OrganizationContext, action: OrgAction): boolean {
    return ctx.actions ? ctx.actions.has(action) : can(ctx.role, action);
}

/**
 * The actions in `actions` this actor does not hold themselves — empty when
 * every one is within their reach.
 *
 * The reach rule (DEC-039, F19): nobody grants a power they don't hold, and
 * nobody changes a role or a person that can do more than they can. Members
 * (who can be put in which role), roles (what a role may be given) and, next,
 * a person's extra permissions all ask this one question, so the answer can
 * never differ between them.
 *
 * Implied holds count, because `allows` reads the actor's resolved set: an
 * actor with `store:write` holds `inventory:write`. Pass the target's
 * RESOLVED set too (`resolveCapabilities`), so a role is judged on everything
 * it would let someone do, not only on what was ticked.
 */
export function outOfReach(
    ctx: OrganizationContext,
    actions: Iterable<OrgAction>,
): OrgAction[] {
    return [...new Set(actions)].filter((a) => !allows(ctx, a));
}

/** Whether every action in `actions` is one this actor holds themselves. */
export function withinReach(
    ctx: OrganizationContext,
    actions: Iterable<OrgAction>,
): boolean {
    return outOfReach(ctx, actions).length === 0;
}

/**
 * What a role may do, given what the organization has stored for it.
 *
 * Three cases, and the third is the one that matters:
 *
 * 1. The business has a row for this role — its own list wins, filtered to
 *    actions that actually exist. An unknown string in the column is dropped
 *    rather than trusted; a role cannot gain a power by being saved with a
 *    typo, and cannot be broken by one either.
 * 2. No row, and the key is a built-in — the shipped map. This is why no
 *    backfill was needed: a business that has invented nothing has no rows,
 *    and resolves exactly as it did before the table existed.
 * 3. No row, and the key is unknown — the read-only floor. A membership
 *    outlives the role it names (the key is deliberately not a foreign key),
 *    so a renamed or deleted role leaves someone seeing LESS than they
 *    expected rather than locked out of a business they belong to.
 */
export function resolveCapabilities(
    roleKey: string,
    stored?: readonly string[] | null,
): ReadonlySet<OrgAction> {
    if (stored) {
        const known = new Set<string>(ORG_ACTIONS);
        return withImplied(
            new Set(stored.filter((a): a is OrgAction => known.has(a))),
        );
    }
    return isBuiltInRole(roleKey) ? CAPABILITIES[roleKey] : CAPABILITIES.MEMBER;
}

/**
 * What `order:write` was split into (DEC-039, B16): a role saved with the old
 * umbrella keeps taking, changing and exporting orders.
 */
const ORDER_WRITE_PARTS: readonly OrgAction[] = [
    "order:create",
    "order:edit",
    "order:export",
];

/** The order powers that each show the whole order they act on. */
const ORDER_POWERS: readonly OrgAction[] = [
    "order:create",
    "order:edit",
    "order:refund",
    "order:export",
];

/**
 * Powers a role holds because it holds a wider one. `store:write` has always
 * covered setting stock, so a role saved before `inventory:write` existed
 * (#513) — or saved without it since — keeps counting.
 *
 * The order split (B16, matrix §2): `order:write` → `order:create`,
 * `order:edit` and `order:export`; `payment:manage` → `order:refund`, since
 * refunds were always its; and each of the four → `order:read`, because a
 * power over an order shows the whole order (matrix §1 rule 2). Applied in
 * that order, so `order:write` and `payment:manage` reach `order:read`
 * through their parts. `order:stage` does not imply `order:read` until F18.
 *
 * Customers (C13, matrix §2): `contact:write` → `contact:read`, since editing
 * a person means seeing them. Nothing implies `customer:sensitive`,
 * `customer:merge` or `customer:remove`: each is granted on its own.
 */
function withImplied(set: Set<OrgAction>): ReadonlySet<OrgAction> {
    if (set.has("store:write")) set.add("inventory:write");
    if (set.has("contact:write")) set.add("contact:read");
    if (set.has("order:write")) {
        for (const part of ORDER_WRITE_PARTS) set.add(part);
    }
    if (set.has("payment:manage")) set.add("order:refund");
    if (ORDER_POWERS.some((power) => set.has(power))) set.add("order:read");
    return set;
}

/**
 * Whether this actor may count and move stock (#513): `inventory:write`, or
 * `store:write`, which implies it. Every stock write and the `canStock` read
 * flag ask this, never either action on its own.
 */
export function canWriteStock(ctx: OrganizationContext): boolean {
    return allows(ctx, "inventory:write") || allows(ctx, "store:write");
}

/** Whether a stored key names one of the four roles every business has. */
export function isBuiltInRole(roleKey: string): roleKey is OrgRole {
    return (ORG_ROLES as readonly string[]).includes(roleKey);
}

/** The shipped permissions for a built-in, used to seed its row. */
export function builtInActions(role: OrgRole): readonly OrgAction[] {
    return [...CAPABILITIES[role]];
}
