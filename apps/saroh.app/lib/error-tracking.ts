import type { AppTrackingSettings } from "@saroh/error-tracking/server";

import { env } from "@/env";

/**
 * The merchant sites' error reporting (DEC-123): SERVER SIDE ONLY.
 *
 * A merchant site's visitors are the merchant's customers; Saroh processes
 * their data only for the merchant. So no tracker script, no SDK and no
 * request to the tracker ever comes from a page a visitor loads:
 * `pnpm run check:merchant-site-tracking` fails the build if the browser
 * SDK, its entry in `@saroh/error-tracking`, or a tracker's address appears
 * anywhere under this app or `packages/site-blocks`.
 *
 * What is reported is an exception this server threw while rendering, with
 * the site's host and the route's template (`/[domain]/products/[slug]`).
 * Never the address asked for, a header, a cookie, an IP address or
 * anything else about the visitor. Off without `POSTHOG_KEY`.
 */
export const trackingSettings: AppTrackingSettings = {
    key: env.POSTHOG_KEY,
    host: env.POSTHOG_HOST,
    app: "sites",
    vercelEnv: env.VERCEL_ENV,
    siteHost: true,
};
