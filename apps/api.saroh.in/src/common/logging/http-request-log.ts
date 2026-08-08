import type { Request } from "express";

import type { CorrelatedRequest } from "./correlation-id.middleware";
import { structuredLogger } from "./structured-logger";

/**
 * The single `http_request` line emitter, shared by `LoggingInterceptor` and
 * `AllExceptionsFilter`.
 *
 * Why both need it: Nest runs GUARDS BEFORE INTERCEPTORS, so a guard rejection
 * never reaches the interceptor — every 401 from `BetterAuthGuard`, 403 from
 * `OriginGuard`/`OrganizationGuard`, and (once enforcement flips) every refusal
 * from `ModuleEnforcementGuard` used to produce ZERO log lines, because the
 * filter only logged 5xx. Denials are exactly the signal a rollout needs, so the
 * filter now emits the line too.
 *
 * The marker below makes that safe: whichever of the two sees the request first
 * logs it, and the other skips it, so a request is still logged exactly once.
 */
const LOGGED = Symbol("saroh.httpRequestLogged");

type MaybeLogged = Request & {
    correlationId?: string;
    startTime?: number;
    [LOGGED]?: true;
};

/**
 * Emit the one-per-request structured line — correlation id, method, path,
 * resolved status, duration — at most once per request. Never logs bodies or
 * headers, so no PII passes through here.
 */
export function logHttpRequestOnce(
    req: CorrelatedRequest | Request,
    statusCode: number,
): void {
    const marked = req as MaybeLogged;
    if (marked[LOGGED]) return;
    marked[LOGGED] = true;

    const level = statusCode >= 500 ? "error" : "info";
    structuredLogger[level]("http_request", {
        correlationId: marked.correlationId ?? "unknown",
        method: req.method,
        path: req.originalUrl,
        statusCode,
        ...(marked.startTime !== undefined
            ? { durationMs: Date.now() - marked.startTime }
            : {}),
    });
}
