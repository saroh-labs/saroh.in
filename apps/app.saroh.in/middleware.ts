import { createAuthMiddleware } from "@saroh/auth/middleware";

import { accountsLoginUrl } from "@/lib/accounts";

// Auth-only gate: every app route requires an accounts session. (The old
// host-based tenant rewriting is gone — the public renderer is sites.saroh.in.)
export default createAuthMiddleware({ loginUrl: accountsLoginUrl });

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
