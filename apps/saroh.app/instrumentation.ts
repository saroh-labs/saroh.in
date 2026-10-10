import { reportRequestError } from "@saroh/error-tracking/server";
import type { Instrumentation } from "next";

import { trackingSettings } from "@/lib/error-tracking";

/**
 * Server errors on merchant sites: Next calls this for an error thrown while
 * rendering a page, in a route handler or in a Server Action. With a key
 * (`POSTHOG_KEY`, DEC-125) it is reported from this server with the site's
 * host, the route's template and Next's digest, and nothing about the
 * visitor. There is no `instrumentation-client` here and there must never
 * be one: nothing of a tracker's reaches a visitor's browser
 * (`lib/error-tracking.ts`). Returned so Next awaits it.
 */
export const onRequestError: Instrumentation.onRequestError = (
    error,
    request,
    context,
) => reportRequestError(error, request, context, trackingSettings);
