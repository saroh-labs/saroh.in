import { reportRequestError } from "@saroh/error-tracking/server";
import type { Instrumentation } from "next";

import { trackingSettings } from "@/lib/error-tracking";

/**
 * Server errors in the admin console: Next calls this for an error thrown while
 * rendering, in a route handler, a Server Action or the proxy. With a
 * PostHog key (DEC-123) the error goes there scrubbed, with the route's
 * template and Next's digest, the reference the boundary shows. Never the
 * address asked for, a header or a cookie. Without a key it does nothing.
 * Returned so Next awaits it: a Worker stops once the response is sent.
 */
export const onRequestError: Instrumentation.onRequestError = (
    error,
    request,
    context,
) => reportRequestError(error, request, context, trackingSettings);
