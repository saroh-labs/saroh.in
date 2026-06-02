import { createAuthMiddleware } from "@saroh/auth/middleware";

import { accountsLoginUrl } from "@/lib/admin-access";

// Every admin route requires an authenticated accounts session. The role
// check (isAdmin) runs server-side in the pages — middleware only enforces
// authentication (Edge-safe cookie presence), not authorization.
export default createAuthMiddleware({ loginUrl: accountsLoginUrl });

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
