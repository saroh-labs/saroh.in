import { withDevAccess } from "@saroh/auth/dev-access";
import { createAuthMiddleware } from "@saroh/auth/middleware";
import { withPrivateApp } from "@saroh/auth/private-app";
import { contentSecurityPolicy } from "@saroh/auth/security-headers";

import { accountsLoginUrl, inviteLandingFor } from "@/lib/accounts";
import { isPublicPath } from "@/lib/public-paths";

import cspSources from "./csp-sources.cjs";

// Auth-only gate: every app route requires an accounts session. (The old
// host-based tenant rewriting is gone — the public renderer is saroh.app.)
// The dev environment admits only browsers holding its key (withDevAccess).
// Outermost, withPrivateApp: every answer given here, the redirect to sign-in
// among them, says "noindex, nofollow" and carries the security headers.
export default withPrivateApp(
    withDevAccess(
        createAuthMiddleware({
            loginUrl: accountsLoginUrl,
            isProtected: (path) => !isPublicPath(path),
            // An invitation link opens the invitation, not the login (UX-029).
            signedOutUrl: inviteLandingFor,
        }),
    ),
    // This answer's CSP, scripts by nonce only (@saroh/auth/security-headers).
    (nonce) => contentSecurityPolicy({ ...cspSources, nonce }),
);

export const config = {
    // Files served from `public/` skip the gate: `next/image` fetches them
    // without the visitor's cookies, and a redirect to sign-in there is a
    // broken image (the template thumbnails, `middleware.test.ts`).
    // The web app manifest too: a browser fetches it without cookies, and
    // a redirect to sign-in there means the app can't be installed.
    matcher: [
        // Only real files: any other path ending in an image name is a page
        // and gets the gate and headers (`lib/middleware-matcher.test.ts`).
        "/((?!_next/static|_next/image|favicon\\.ico$|manifest\\.webmanifest$|(?:templates|demo)/[\\w/-]+\\.(?:png|jpe?g|webp|svg)$|(?:icon-192|icon-512|og-image|empty-state|placeholder|thumbnail)\\.png$|(?:next|vercel)\\.svg$).*)",
    ],
};
