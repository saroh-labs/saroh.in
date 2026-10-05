import { withDevAccess } from "@saroh/auth/dev-access";
import { createAuthMiddleware } from "@saroh/auth/middleware";

import { accountsLoginUrl } from "@/lib/accounts";

// Auth-only gate: every app route requires an accounts session. (The old
// host-based tenant rewriting is gone — the public renderer is saroh.app.)
// The dev environment admits only browsers holding its key (withDevAccess).
export default withDevAccess(
    createAuthMiddleware({ loginUrl: accountsLoginUrl }),
);

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
