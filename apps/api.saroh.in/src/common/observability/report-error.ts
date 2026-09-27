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

/** Mask what an error message should never carry to a third party. */
export function scrubMessage(message: string): string {
    return message
        .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
        .replace(/\bBearer\s+[\w.~+/-]+=*/gi, "Bearer [token]")
        .replace(/\+?\d[\d\s-]{8,}\d/g, "[number]")
        .slice(0, MAX_MESSAGE);
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
    const error =
        exception instanceof Error
            ? exception
            : new Error(
                  typeof exception === "string"
                      ? exception
                      : "A non-Error value was thrown",
              );
    return {
        name: error.name,
        message: scrubMessage(error.message),
        ...(error.stack ? { stack: error.stack } : {}),
        correlationId: ctx.correlationId,
        statusCode: ctx.statusCode,
        ...(ctx.method ? { method: ctx.method } : {}),
        ...(ctx.url ? { path: pathOnly(ctx.url) } : {}),
        ...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}),
    };
}

/** Log an unhandled error, and forward it when a tracker is installed. */
export function reportError(exception: unknown, ctx: ServerErrorContext): void {
    structuredLogger.error("unhandled_exception", {
        correlationId: ctx.correlationId,
        method: ctx.method,
        path: ctx.url ? redactUrl(ctx.url) : undefined,
        statusCode: ctx.statusCode,
        errorName:
            exception instanceof Error ? exception.name : typeof exception,
        errorMessage:
            exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? exception.stack : undefined,
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
