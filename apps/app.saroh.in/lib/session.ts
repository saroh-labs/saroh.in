import { getServerSession } from "@saroh/auth/next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { accountsLoginUrl } from "./accounts";

export { accountsLoginUrl, accountsUrl } from "./accounts";

/**
 * Resolve the accounts session for an RSC / server action. Redirects to
 * accounts sign-in when there is no valid session (defense in depth behind
 * the middleware gate). Server-only — imports next/headers.
 */
export async function requireSession() {
    const session = await getServerSession(await headers());
    if (!session) redirect(accountsLoginUrl);
    return session;
}
