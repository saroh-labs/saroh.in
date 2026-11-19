import { CODE_MAIL_PATHS } from "@saroh/auth";

import { fromAccounts } from "../accounts-origins";

/**
 * Better Auth's routes that mail a code, a link or the existing-account
 * notice, asked from anywhere but an accounts site (owner, 18 Nov): 403
 * before Better Auth sees them. A password sign-in mails only an unproven
 * account and is counted by `mayMailCode`; it stays open to the load test's
 * server-side sign-in. A cheap filter, not authentication.
 */
export function refusedCodeMail(request: Request): Response | null {
    if (request.method !== "POST") return null;
    const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "");
    if (path === "/sign-in/email" || !CODE_MAIL_PATHS.includes(path)) {
        return null;
    }
    const { headers } = request;
    if (
        fromAccounts(
            { origin: headers.get("origin"), referer: headers.get("referer") },
            headers.get("host"),
        )
    ) {
        return null;
    }
    return Response.json(
        {
            code: "FORBIDDEN_ORIGIN",
            message: "Codes are sent from Saroh's sign-in only.",
        },
        { status: 403 },
    );
}
