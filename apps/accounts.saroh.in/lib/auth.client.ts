import {
    adminClient,
    apiKeyClient,
    emailOTPClient,
    organizationClient,
    twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
    // Use same-origin in the browser. Set baseURL only if calling a different domain.
    plugins: [
        emailOTPClient(),
        adminClient(),
        apiKeyClient(),
        organizationClient(),
        twoFactorClient(),
    ],
});
const { useSession } = authClient;
