/**
 * Project-level roles and their precedence (S1-010).
 *
 * Distinct from Organization roles (OWNER/ADMIN/MEMBER on `Membership`): a
 * Project role governs what a MEMBER may do WITHIN one Project they've been
 * granted access to — directly or via a Team. OWNER/ADMIN never need a grant;
 * they implicitly see every Project in their org (ADR-001).
 *
 * This module is pure (no Nest DI, no Prisma) so precedence resolution is
 * trivially unit-testable and project roles are never compared as raw strings.
 */

/** The closed set of project roles, strongest last. */
export const PROJECT_ROLES = ["VIEWER", "EDITOR", "MANAGER"] as const;

export type ProjectRole = (typeof PROJECT_ROLES)[number];

/**
 * Precedence rank — MANAGER > EDITOR > VIEWER. Used to pick the strongest of a
 * user's direct grant and any Team grants: access is the UNION of every path,
 * so the caller ends up with the most capable role any path confers.
 */
const RANK: Record<ProjectRole, number> = {
    VIEWER: 1,
    EDITOR: 2,
    MANAGER: 3,
};

/** Type guard narrowing a free-form DB/string value to a known {@link ProjectRole}. */
export function isProjectRole(value: string): value is ProjectRole {
    return (PROJECT_ROLES as readonly string[]).includes(value);
}

/**
 * The strongest role among the given ones (MANAGER wins), or `null` when the
 * list is empty (no access via any path). Unknown strings are ignored so a bad
 * row can never masquerade as a role.
 */
export function strongestProjectRole(
    roles: readonly string[],
): ProjectRole | null {
    let best: ProjectRole | null = null;
    for (const role of roles) {
        if (!isProjectRole(role)) continue;
        if (best === null || RANK[role] > RANK[best]) {
            best = role;
        }
    }
    return best;
}

/**
 * Capabilities a project role confers, mirroring the org policy's read/write/
 * manage split but scoped to a single Project. Kept separate from
 * organization-policy.ts so the two vocabularies never bleed together.
 *
 *  - VIEWER  — read-only.
 *  - EDITOR  — read + write project content.
 *  - MANAGER — full control of the project (incl. managing its members).
 */
export type ProjectAction = "project:read" | "project:write" | "project:manage";

const PROJECT_CAPABILITIES: Record<ProjectRole, ReadonlySet<ProjectAction>> = {
    VIEWER: new Set<ProjectAction>(["project:read"]),
    EDITOR: new Set<ProjectAction>(["project:read", "project:write"]),
    MANAGER: new Set<ProjectAction>([
        "project:read",
        "project:write",
        "project:manage",
    ]),
};

/** Pure predicate: may `role` perform `action` within a project? */
export function canInProject(
    role: ProjectRole,
    action: ProjectAction,
): boolean {
    return PROJECT_CAPABILITIES[role].has(action);
}
