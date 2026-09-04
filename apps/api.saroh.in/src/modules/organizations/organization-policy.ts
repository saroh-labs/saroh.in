import { ForbiddenException } from "@nestjs/common";

import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";

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
 *                  `site:read` is in the read-only floor (every role, including
 *                  MEMBER, may list/read the org's sites). `site:create` /
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
 *                OWNER/ADMIN-only: none are in READ_ONLY_ACTIONS, so a MEMBER
 *                cannot read contacts, leads, or the pipeline. This is the
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
    | "payment:read"
    | "payment:manage"
    | "message:read"
    | "message:write"
    | "comms:manage"
    | "consent:read"
    | "consent:write"
    | "automation:manage"
    | "analytics:read"
    | "billing:read"
    | "billing:manage"
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
    "payment:read",
    "payment:manage",
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
    // Modular capabilities (ADR-003).
    "module:read",
    "module:manage",
];

/** Read-only actions — the floor every role (including MEMBER) may perform. */
const READ_ONLY_ACTIONS: readonly OrgAction[] = [
    "org:read",
    "member:read",
    "store:read",
    "site:read",
    "media:read",
    // Every role may read effective module availability (ADR-003); managing
    // modules requires the separate OWNER/ADMIN `module:manage` action.
    "module:read",
];

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
 *             write layer in a later ticket, S1-006; it is not expressible as a
 *             coarse role→action capability and so is intentionally out of
 *             scope here.)
 *  - MEMBER — read-only: can see the org, its roster, and its stores, but
 *             mutates nothing.
 *
 * Sets are frozen-by-construction (never mutated after build) so a leaked
 * reference can't widen a role's capabilities.
 */
const CAPABILITIES: Record<OrgRole, ReadonlySet<OrgAction>> = {
    OWNER: new Set<OrgAction>(ORG_ACTIONS),
    ADMIN: new Set<OrgAction>(
        ORG_ACTIONS.filter((action) => action !== "org:delete"),
    ),
    MEMBER: new Set<OrgAction>(READ_ONLY_ACTIONS),
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
    if (!can(ctx.role, action)) {
        throw new ForbiddenException(
            `Role "${ctx.role}" may not perform "${action}"`,
        );
    }
}
