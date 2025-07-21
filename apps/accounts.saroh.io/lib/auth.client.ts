import {
    adminClient,
    apiKeyClient,
    emailOTPClient,
    organizationClient,
    twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient({
    /** The base URL of the server (optional if you're using the same domain) */
    baseURL: process.env.BETTER_AUTH_URL as string,
    plugins: [
        emailOTPClient(),
        adminClient(),
        apiKeyClient(),
        organizationClient(),
        twoFactorClient()
    ],
});
const { useSession } = authClient;
