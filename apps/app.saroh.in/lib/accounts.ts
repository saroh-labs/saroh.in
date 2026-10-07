// Client/Edge-safe accounts URLs — no server-only imports, so this can be
// imported from client components and Edge middleware. The server-only
// requireSession() lives in lib/session.ts.
import { env } from "@/env";

export const accountsUrl =
    env.NEXT_PUBLIC_ACCOUNTS_URL ?? "https://accounts.saroh.in";

export const accountsLoginUrl = `${accountsUrl}/login`;

/**
 * Your own account on accounts.saroh.in: name, email, password and where you
 * are signed in. Identity lives there, so Your profile links out to it.
 */
export const accountSettingsUrl = `${accountsUrl}/account`;

/**
 * The invitation's own page on accounts for an invitation link
 * (`/join/:token`), or null for any other path (UX-029). Someone signed out
 * who follows the email's link reads the business, who asked and the role,
 * then picks "Create an account" or "Log in" — instead of a bare "Log in ·
 * Welcome back" that never mentions the invitation.
 */
export function inviteLandingFor(pathname: string): string | null {
    const token = /^\/join\/([^/]+)\/?$/.exec(pathname)?.[1];
    return token ? `${accountsUrl}/invite/${token}` : null;
}
