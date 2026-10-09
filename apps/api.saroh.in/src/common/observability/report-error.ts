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
 * No SDK is installed, and choosing one is the user's decision. Until then
 * there is no sink and nothing leaves the process. `ERROR_TRACKING_DSN` is
 * the switch; see {@link installErrorTracking}.
 */

export interface ServerErrorContext {
    correlationId: string;
    statusCode: number;
    method?: string;
    /** The raw request URL; only its redacted path is ever kept. */
    url?: string;
    headers?: Record<string, string | string[] | undefined>;
    organizationId?: string;
}

/** What a tracker receives. No body, no headers, no query string, no user. */
export interface ServerErrorEvent {
    name: string;
    message: string;
    stack?: string;
    correlationId: string;
    statusCode: number;
    method?: string;
    path?: string;
    organizationId?: string;
}

export interface ErrorSink {
    capture(event: ServerErrorEvent): void;
}

let sink: ErrorSink | null = null;

/** Install (or with `null`, remove) the tracker's sink. */
export function setErrorSink(next: ErrorSink | null): void {
    sink = next;
}

const MAX_MESSAGE = 500;

/** Mask what an error's words should never carry: emails, numbers, tokens. */
function scrub(text: string): string {
    return text
        .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
        .replace(/\bBearer\s+[\w.~+/-]+=*/gi, "Bearer [token]")
        .replace(/\+?\d[\d\s-]{8,}\d/g, "[number]");
}

/** Mask what an error message should never carry to a third party. */
export function scrubMessage(message: string): string {
    return scrub(message).slice(0, MAX_MESSAGE);
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

/** The path alone: no query string, where tokens and emails turn up. */
function pathOnly(url: string | undefined): string | undefined {
    if (!url) return undefined;
    return redactUrl(url).split("?")[0];
}

export function toServerErrorEvent(
    exception: unknown,
    ctx: ServerErrorContext,
): ServerErrorEvent {
    const error = errorFacts(exception);
    return {
        name: error.name,
        message: scrubMessage(error.message),
        ...(error.stack ? { stack: scrub(error.stack) } : {}),
        correlationId: ctx.correlationId,
        statusCode: ctx.statusCode,
        ...(ctx.method ? { method: ctx.method } : {}),
        ...(ctx.url ? { path: pathOnly(ctx.url) } : {}),
        ...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}),
    };
}

/**
 * Log an unhandled error once, and forward it when a tracker is installed.
 *
 * The line carries the error's name, message, stack and code (emails, long
 * numbers and bearer tokens masked), the request's correlation id, method,
 * path and status, and its headers redacted by `redact.ts`; never a body.
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
        errorMessage: scrub(error.message),
        ...(error.code ? { errorCode: error.code } : {}),
        stack: error.stack ? scrub(error.stack) : undefined,
        headers: ctx.headers ? redactHeaders(ctx.headers) : undefined,
    });
    if (!sink) return;
    try {
        sink.capture(toServerErrorEvent(exception, ctx));
    } catch (sinkError) {
        // A tracker outage must never turn into a second failure.
        structuredLogger.warn("error_sink_failed", {
            correlationId: ctx.correlationId,
            errorMessage:
                sinkError instanceof Error ? sinkError.message : "unknown",
        });
    }
}

/**
 * Called once at startup. Off by default: without a DSN, no sink. With one,
 * this is where the tracker's SDK is initialised and its sink installed.
 * No SDK is chosen yet, so for now it says so rather than pretending to
 * forward. Returns whether a sink was installed.
 */
export function installErrorTracking(dsn: string | undefined): boolean {
    if (!dsn) return false;
    structuredLogger.warn("error_tracking_not_installed", {
        reason: "ERROR_TRACKING_DSN is set, but no tracker SDK is wired yet (#103). Errors are logged only.",
    });
    return false;
}
