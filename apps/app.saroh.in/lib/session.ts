import { getServerSession } from "@saroh/auth/next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const accountsUrl =
    process.env.NEXT_PUBLIC_ACCOUNTS_URL ?? "https://accounts.saroh.in";

export const accountsLoginUrl = `${accountsUrl}/login`;

/**
 * Resolve the accounts session for an RSC / server action. Redirects to
 * accounts sign-in when there is no valid session (defense in depth behind
 * the middleware gate). Returns the validated Better Auth session.
 */
export async function requireSession() {
    const session = await getServerSession(await headers());
    if (!session) redirect(accountsLoginUrl);
    return session;
}
