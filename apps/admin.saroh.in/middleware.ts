import { withDevAccess } from "@saroh/auth/dev-access";
import { createAuthMiddleware } from "@saroh/auth/middleware";
import { withPrivateApp } from "@saroh/auth/private-app";

import { accountsLoginUrl } from "@/lib/admin-access";

// Every admin route requires an authenticated accounts session. The role
// check (isAdmin) runs server-side in the pages — middleware only enforces
// authentication (Edge-safe cookie presence), not authorization.
// The dev environment admits only browsers holding its key (withDevAccess).
// Outermost, withPrivateApp: every answer given here, the redirect to sign-in
// among them, says "noindex, nofollow" and carries the security headers.
export default withPrivateApp(
    withDevAccess(createAuthMiddleware({ loginUrl: accountsLoginUrl })),
);

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
