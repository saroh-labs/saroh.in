import { withDevAccess } from "@saroh/auth/dev-access";
import { createAuthMiddleware } from "@saroh/auth/middleware";
import { withPrivateApp } from "@saroh/auth/private-app";

import { accountsLoginUrl, inviteLandingFor } from "@/lib/accounts";

// Auth-only gate: every app route requires an accounts session. (The old
// host-based tenant rewriting is gone — the public renderer is saroh.app.)
// The dev environment admits only browsers holding its key (withDevAccess).
// Outermost, withPrivateApp: every answer given here, the redirect to sign-in
// among them, says "noindex, nofollow" and carries the security headers.
export default withPrivateApp(
    withDevAccess(
        createAuthMiddleware({
            loginUrl: accountsLoginUrl,
            // An invitation link opens the invitation, not the login (UX-029).
            signedOutUrl: inviteLandingFor,
        }),
    ),
);

export const config = {
    // Files served from `public/` skip the gate: `next/image` fetches them
    // without the visitor's cookies, and a redirect to sign-in there is a
    // broken image (the template thumbnails, `middleware.test.ts`).
    // The web app manifest too: a browser fetches it without cookies, and
    // a redirect to sign-in there means the app can't be installed.
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico)$).*)",
    ],
};
