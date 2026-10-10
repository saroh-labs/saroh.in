/**
 * The one place a frontend error boundary sends an error (#103).
 *
 * Vendor-neutral on purpose: this file knows no tracker. Until one is
 * registered with {@link setErrorReporter}, it logs to the console exactly as
 * the boundaries did before. The workspace, accounts, the admin console and
 * saroh.in register PostHog's (DEC-123) in their `instrumentation-client.ts`,
 * only when the app has a key; merchant sites, docs, help, templates and the
 * UI gallery register nothing, so their boundaries only log.
 *
 * What a report carries is fixed here, not by each caller: the error's name,
 * message and stack, where it was caught, and Next's `digest` (the id the
 * server logged the same error under). Never a request body, form values, a
 * cookie, or the page's query string. The message is masked here; the
 * registered reporter (`@saroh/error-tracking/browser`) scrubs the message
 * and the stack again with the shared scrubber before anything is sent.
 */

export interface ErrorReportContext {
    /** Which boundary caught it, e.g. "app/root" or "sites/domain". */
    boundary: string;
    /** Next's server-side error id, when the error came from the server. */
    digest?: string;
}

export interface ErrorReport extends ErrorReportContext {
    name: string;
    message: string;
    stack?: string;
}

export type ErrorReporter = (report: ErrorReport) => void;

let reporter: ErrorReporter | null = null;

/** Install the tracker's forwarder. `null` goes back to console-only. */
export function setErrorReporter(next: ErrorReporter | null): void {
    reporter = next;
}

/** Longest message kept; an error message is not a place for a payload. */
const MAX_MESSAGE = 500;

/** Mask what an error message should never carry to a third party. */
export function scrubMessage(message: string): string {
    return message
        .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
        .replace(/\bBearer\s+[\w.~+/-]+=*/gi, "Bearer [token]")
        .replace(/\+?\d[\d\s-]{8,}\d/g, "[number]")
        .slice(0, MAX_MESSAGE);
}

/** Build the report a boundary sends. Exported for tests. */
export function toReport(
    error: unknown,
    context: ErrorReportContext,
): ErrorReport {
    const err =
        error instanceof Error
            ? error
            : new Error(
                  typeof error === "string"
                      ? error
                      : "A non-Error value was thrown",
              );
    return {
        boundary: context.boundary,
        ...(context.digest ? { digest: context.digest } : {}),
        name: err.name,
        message: scrubMessage(err.message),
        ...(err.stack ? { stack: err.stack } : {}),
    };
}

/**
 * Report an error a boundary caught. Always logs; also forwards when a tracker
 * is registered. A reporter that throws never takes the boundary down with it.
 */
export function reportError(error: unknown, context: ErrorReportContext): void {
    // The console keeps the original error object: devtools shows its cause
    // chain and source-mapped stack, which a plain report would lose.
    console.error(`[${context.boundary}]`, error);
    if (!reporter) return;
    try {
        reporter(toReport(error, context));
    } catch (forwardError) {
        console.error("[report-error] the error reporter failed", forwardError);
    }
}
