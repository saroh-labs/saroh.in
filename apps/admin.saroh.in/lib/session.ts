import {
    resolveServerSession,
    SessionUnavailableError,
} from "@saroh/auth/next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { accountsLoginUrl } from "./admin-access";

/**
 * Resolve the accounts session for an admin RSC. Redirects to accounts
 * sign-in when there is definitively no session; throws when the api could
 * not be asked, so `app/error.tsx` offers a retry.
 *
 * The distinction matters more here than anywhere: staff reach for this app
 * precisely when the platform is misbehaving, so the api being unwell is the
 * expected condition, not the surprising one. Bouncing them to sign-in during
 * an incident takes away the console they came to diagnose it with.
 *
 * This decides only *authentication*. Whether the session belongs to staff is
 * the API's call — see lib/admin-access.ts.
 */
export async function requireSession() {
    const result = await resolveServerSession(await headers());

    if (result.status === "unavailable") {
        throw new SessionUnavailableError(result);
    }
    if (result.status === "anonymous") {
        redirect(accountsLoginUrl);
    }

    return result.session;
}
