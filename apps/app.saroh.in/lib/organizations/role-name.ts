const BUILT_IN_ROLES: Record<string, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Member",
    REVIEWER: "Reviewer",
};

/**
 * A role as the screen names it: the business's own label, else the
 * built-in's. The one place a denial, a read-only note and the product
 * editor read a person's role from.
 */
export function roleName(org: {
    role?: string | null;
    roleLabel?: string | null;
}): string {
    if (org.roleLabel?.trim()) return org.roleLabel.trim();
    return (org.role && BUILT_IN_ROLES[org.role]) ?? "Member";
}

/**
 * The same, or null when the name isn't known: for a sentence that would
 * rather leave the role out than guess it (`whoCanChange`).
 *
 * A role the business made maps to MEMBER, so `role` alone can't tell a
 * Member from a made role whose label didn't arrive. With the stored key to
 * hand, a key that is the built-in's own is that built-in. Without it, only
 * Owner, Admin and Reviewer are certain. Never the key itself.
 */
export function knownRoleName(org: {
    role?: string | null;
    roleKey?: string | null;
    roleLabel?: string | null;
}): string | null {
    if (org.roleLabel?.trim()) return org.roleLabel.trim();
    if (!org.role) return null;
    const builtIn = BUILT_IN_ROLES[org.role] ?? null;
    if (org.roleKey) return org.roleKey === org.role ? builtIn : null;
    return org.role === "MEMBER" ? null : builtIn;
}
