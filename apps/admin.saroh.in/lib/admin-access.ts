import { env } from "@/env";

export const accountsUrl =
    env.NEXT_PUBLIC_ACCOUNTS_URL ?? "https://accounts.saroh.in";

export const accountsLoginUrl = `${accountsUrl}/login`;

/**
 * Fail-closed admin gate. Only emails listed in `ADMIN_ALLOWLIST`
 * (comma-separated) are admins; access is DENIED when the env is unset or
 * the email isn't listed — this is how the first admin is seeded.
 *
 * This is the single authorization seam: when the M2 admin plugin lands,
 * swap the allowlist check for `session.user.role === "admin"` here only.
 */
export function isAdmin(
    session: { user?: { email?: string | null } | null } | null,
): boolean {
    const email = session?.user?.email?.toLowerCase();
    if (!email) return false;
    const allow = (env.ADMIN_ALLOWLIST ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    return allow.length > 0 && allow.includes(email);
}
