// @ts-check
"use strict";

/**
 * What this app's pages load, for its Content-Security-Policy
 * (`contentSecurityPolicy`, @saroh/auth/security-headers): one list, read by
 * the middleware, which enforces the policy with a nonce per request, and by
 * next.config for the Permissions-Policy.
 *
 * @type {import("@saroh/auth/security-headers").PageHeaderOptions}
 */
module.exports = {
    origins: [
        process.env.NEXT_PUBLIC_API_URL,
        process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    ],
    uses: ["razorpay", "uploads", "unsplash"],
    posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    dev: process.env.NODE_ENV === "development",
};
