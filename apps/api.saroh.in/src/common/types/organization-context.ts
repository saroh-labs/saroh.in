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
export type OrgRole = "OWNER" | "ADMIN" | "MEMBER";

/** The set of Organization roles, for exhaustive iteration/validation. */
export const ORG_ROLES: readonly OrgRole[] = ["OWNER", "ADMIN", "MEMBER"];

export interface OrganizationContext {
    organizationId: string;
    userId: string;
    role: OrgRole;
}
