import { withDevAccess } from "@saroh/auth/dev-access";
import { createAuthMiddleware } from "@saroh/auth/middleware";

import { accountsLoginUrl, inviteLandingFor } from "@/lib/accounts";

// Auth-only gate: every app route requires an accounts session. (The old
// host-based tenant rewriting is gone — the public renderer is saroh.app.)
// The dev environment admits only browsers holding its key (withDevAccess).
export default withDevAccess(
    createAuthMiddleware({
        loginUrl: accountsLoginUrl,
        // An invitation link opens the invitation, not the login (UX-029).
        signedOutUrl: inviteLandingFor,
    }),
);

export const config = {
    // Files served from `public/` skip the gate: `next/image` fetches them
    // without the visitor's cookies, and a redirect to sign-in there is a
    // broken image (the template thumbnails, `middleware.test.ts`).
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico)$).*)",
    ],
};
