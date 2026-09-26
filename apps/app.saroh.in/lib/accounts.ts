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
