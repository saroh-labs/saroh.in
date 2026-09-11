import {
    resolveServerSession,
    SessionUnavailableError,
} from "@saroh/auth/next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { accountsLoginUrl } from "./accounts";

export { accountsLoginUrl, accountsUrl } from "./accounts";

/**
 * Resolve the accounts session for an RSC / server action. Redirects to
 * accounts sign-in when there is no valid session (defense in depth behind
 * the middleware gate). Server-only — imports next/headers.
 *
 * Throws `SessionUnavailableError` when the api could not be reached, so the
 * nearest `error.tsx` offers a retry. Redirecting there instead would sign
 * every user out on one api restart, and land them at accounts — which reads
 * the same session from the same api — with their place lost.
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
