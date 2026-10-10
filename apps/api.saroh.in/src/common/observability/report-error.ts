import {
    routeTemplate,
    scrubMessage as scrubSharedMessage,
    scrubStack,
    scrubText,
} from "@saroh/error-tracking";

import { redactHeaders, redactUrl } from "../logging/redact";
import { structuredLogger } from "../logging/structured-logger";

/**
 * The one place the API reports an unhandled error (#103).
 *
 * `AllExceptionsFilter` calls this for every 5xx. It always writes the same
 * `unhandled_exception` log line the filter used to write itself, with the
 * stack and redacted headers. Those lines stay on our own log stream. When
 * an error tracker is installed ({@link setErrorSink}), it also receives a
 * {@link ServerErrorEvent}, a smaller and scrubbed shape. Tracker-side
 * scrubbing is a second net, not the first.
 *
 * The tracker is PostHog (DEC-123), installed by `installTelemetry`
 * (`posthog.ts`) when `POSTHOG_KEY` is set. Without it there is no sink and
 * nothing leaves the process. The scrubbing is `@saroh/error-tracking`'s,
 * the one scrubber every app shares.
 *
 * A job that failed its last attempt comes through {@link reportJobError}.
 */

export interface ServerErrorContext {
    correlationId: string;
    statusCode: number;
    method?: string;
    /** The raw request URL; only its redacted path is ever kept. */
    url?: string;
    /**
     * The matched route's template (`/organizations/:organizationId/orders`),
     * from the framework. A tracker gets this, never the address asked for.
     */
    route?: string;
    headers?: Record<string, string | string[] | undefined>;
    organizationId?: string;
}

/**
 * What a tracker receives. No body, no headers, no query string, no user,
 * and no address: `route` is a template with every id replaced.
 */
export interface ServerErrorEvent {
    name: string;
    message: string;
    stack?: string;
    correlationId: string;
    statusCode?: number;
    method?: string;
    route?: string;
    organizationId?: string;
    /** A background job's handler key and id, when a job failed. */
    jobType?: string;
    jobId?: string;
}

export interface ErrorSink {
    capture(event: ServerErrorEvent): void;
}

let sink: ErrorSink | null = null;

/** Install (or with `null`, remove) the tracker's sink. */
export function setErrorSink(next: ErrorSink | null): void {
    sink = next;
}

/** Mask what an error message should never carry to a third party. */
export function scrubMessage(message: string): string {
    return scrubSharedMessage(message);
}

/** What can be said about a thrown value. */
export interface ErrorFacts {
    name: string;
    message: string;
    stack?: string;
    code?: string;
}

/**
 * A thrown value's name, message, stack and code, read by shape rather than
 * `instanceof Error`. That check is false for an error made in another realm
 * (a VM context, as under Jest, or a native binding's), and such an error
 * was logged with its type, "object", for a name and no stack at all. A
 * value that isn't error-shaped is never stringified: it may be a body.
 */
export function errorFacts(exception: unknown): ErrorFacts {
    if (
        typeof exception === "object" &&
        exception !== null &&
        typeof (exception as { message?: unknown }).message === "string"
    ) {
        const e = exception as {
            name?: unknown;
            message: string;
            stack?: unknown;
            code?: unknown;
        };
        return {
            name: typeof e.name === "string" ? e.name : "Error",
            message: e.message,
            ...(typeof e.stack === "string" ? { stack: e.stack } : {}),
            ...(typeof e.code === "string" ? { code: e.code } : {}),
        };
    }
    return {
        name: "Error",
        message:
            typeof exception === "string"
                ? exception
                : "A non-Error value was thrown",
    };
}

/**
 * The route a tracker is told: the framework's own template when a route
 * matched (`/orders/:orderId`), else the path with every id-like segment
 * replaced. Never the query string, where tokens and emails turn up.
 */
function routeOf(ctx: ServerErrorContext): string | undefined {
    if (ctx.route) return ctx.route.split("?")[0]?.slice(0, 200);
    if (!ctx.url) return undefined;
    return routeTemplate(redactUrl(ctx.url));
}

export function toServerErrorEvent(
    exception: unknown,
    ctx: ServerErrorContext,
): ServerErrorEvent {
    const error = errorFacts(exception);
    const route = routeOf(ctx);
    return {
        name: error.name,
        message: scrubMessage(error.message),
        ...(error.stack ? { stack: scrubStack(error.stack) } : {}),
        correlationId: ctx.correlationId,
        statusCode: ctx.statusCode,
        ...(ctx.method ? { method: ctx.method } : {}),
        ...(route ? { route } : {}),
        ...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}),
    };
}

/** A tracker outage must never turn into a second failure. */
function forward(event: () => ServerErrorEvent, correlationId: string): void {
    if (!sink) return;
    try {
        sink.capture(event());
    } catch (sinkError) {
        structuredLogger.warn("error_sink_failed", {
            correlationId,
            errorMessage:
                sinkError instanceof Error ? sinkError.message : "unknown",
        });
    }
}

/**
 * Log an unhandled error once, and forward it when a tracker is installed.
 *
 * The line carries the error's name, message, stack and code (scrubbed),
 * the request's correlation id, method, path and status, and its headers
 * redacted by `redact.ts`; never a body.
 */
export function reportError(exception: unknown, ctx: ServerErrorContext): void {
    const error = errorFacts(exception);
    structuredLogger.error("unhandled_exception", {
        correlationId: ctx.correlationId,
        method: ctx.method,
        path: ctx.url ? redactUrl(ctx.url) : undefined,
        statusCode: ctx.statusCode,
        ...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}),
        errorName: error.name,
        errorMessage: scrubText(error.message),
        ...(error.code ? { errorCode: error.code } : {}),
        stack: error.stack ? scrubStack(error.stack) : undefined,
        headers: ctx.headers ? redactHeaders(ctx.headers) : undefined,
    });
    forward(() => toServerErrorEvent(exception, ctx), ctx.correlationId);
}

/** A job that will not be tried again. */
export interface FailedJobContext {
    jobId: string;
    jobType: string;
    organizationId?: string | null;
    attempts: number;
}

/**
 * Report a background job that failed its **last** attempt: it is FAILED
 * and will not run again. Earlier attempts are retried, and only logged by
 * the worker.
 *
 * ERROR, `job_failed_final`: something a person was waiting for (an email,
 * a renewal, a refund's send) did not happen. Any at all is worth a look;
 * the row keeps the reason in `lastError`. Forwarded to the tracker with
 * the job's type and id and the business's id. Never the job's payload.
 */
export function reportJobError(
    exception: unknown,
    job: FailedJobContext,
): void {
    const error = errorFacts(exception);
    structuredLogger.error("job_failed_final", {
        jobId: job.jobId,
        jobType: job.jobType,
        attempts: job.attempts,
        ...(job.organizationId ? { organizationId: job.organizationId } : {}),
        errorName: error.name,
        errorMessage: scrubText(error.message),
    });
    forward(
        () => ({
            name: error.name,
            message: scrubMessage(error.message),
            ...(error.stack ? { stack: scrubStack(error.stack) } : {}),
            // A job has no request; its id is what finds it in the logs.
            correlationId: job.jobId,
            jobType: job.jobType,
            jobId: job.jobId,
            ...(job.organizationId
                ? { organizationId: job.organizationId }
                : {}),
        }),
        job.jobId,
    );
}
