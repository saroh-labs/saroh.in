/**
 * Organization authorization primitives (S1-003).
 *
 * `OrganizationContext` is the ONLY thing business handlers should receive:
 * an already-authenticated user (`userId`) whose access to a specific
 * Organization (`organizationId`) has been resolved to a concrete role. It is
 * produced by {@link OrganizationContextService.resolve} and attached to the
 * request by `OrganizationGuard`, so a controller never sees a raw session
 * user + arbitrary org id — it sees a proven `{ organizationId, userId, role }`.
 *
 * Roles are the canonical Organization roles from ADR-001 (on the `Membership`
 * model). They are intentionally a closed union so the policy in
 * `organization-policy.ts` can be exhaustively checked at compile time.
 */
/**
 * REVIEWER is website-only (#193): it exists so the person who signs off the
 * copy can see an unpublished site and leave notes on it, without gaining any
 * of the workspace. It is deliberately NOT a rung on the OWNER/ADMIN/MEMBER
 * ladder — it sees less than a MEMBER of the business, and more than a MEMBER
 * of the website. Ordering these by "seniority" would be wrong.
 */
export type OrgRole = "OWNER" | "ADMIN" | "MEMBER" | "REVIEWER";

/** The set of Organization roles, for exhaustive iteration/validation. */
/**
 * Every role a Membership row may name. `Membership.role` is a free-form
 * string, so this list is what narrows it — a value missing from here is
 * treated as MEMBER and logged.
 *
 * That fail-closed behaviour is right for a bad row and wrong for a role we
 * simply forgot to add: REVIEWER would have been silently downgraded to MEMBER,
 * which reads less (no site notes) and more (the whole org's roster and
 * stores) than intended. Adding a role to OrgRole means adding it here.
 */
export const ORG_ROLES: readonly OrgRole[] = [
    "OWNER",
    "ADMIN",
    "MEMBER",
    "REVIEWER",
];

export interface OrganizationContext {
    organizationId: string;
    userId: string;
    role: OrgRole;
}
