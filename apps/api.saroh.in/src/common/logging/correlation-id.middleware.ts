import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

import {
    correlationStorage,
    REQUEST_ID_HEADERS,
    RESPONSE_ID_HEADER,
} from "./request-context";

/** An Express request enriched by {@link correlationIdMiddleware}. */
export interface CorrelatedRequest extends Request {
    correlationId: string;
    startTime: number;
}

const MAX_ID_LENGTH = 128;
// Only accept simple token ids from clients to avoid header/log injection.
const SAFE_ID = /^[\w.-]+$/;

function isSafeId(value: string): boolean {
    return (
        value.length > 0 && value.length <= MAX_ID_LENGTH && SAFE_ID.test(value)
    );
}

function readIncomingId(req: Request): string | undefined {
    for (const header of REQUEST_ID_HEADERS) {
        const value = req.headers[header];
        const candidate = Array.isArray(value) ? value[0] : value;
        if (typeof candidate === "string" && isSafeId(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

/**
 * Assigns every request a correlation id (reusing a trusted inbound
 * `X-Request-Id`/`X-Correlation-Id` header, otherwise minting a UUID), echoes
 * it on the response, records a start time for request-duration logging, and
 * runs the remainder of the request inside the correlation AsyncLocalStorage so
 * downstream logs inherit the id automatically.
 *
 * Registered as a plain Express middleware (`app.use`) in main.ts so it runs
 * before every route, including the mounted Better Auth handler.
 */
export function correlationIdMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const correlationId = readIncomingId(req) ?? randomUUID();
    const correlated = req as CorrelatedRequest;
    correlated.correlationId = correlationId;
    correlated.startTime = Date.now();
    res.setHeader(RESPONSE_ID_HEADER, correlationId);
    // The method and the path ride along for an error reported from outside
    // Nest (Better Auth's handler, `common/auth/report-auth-error.ts`).
    const path = (req.originalUrl || req.url || "").split("?")[0];
    // Address and browser ride along for the admin ledger (review B1).
    // The admin console calls server-side and names its visitor; kept beside
    // the address the request really came from, never instead of it.
    const userAgent = req.headers["user-agent"]?.slice(0, 512);
    const named = req.headers["x-admin-client-ip"];
    const ip =
        typeof named === "string" && path.startsWith("/admin")
            ? `${named.slice(0, 64)} via ${req.ip ?? "unknown"}`
            : req.ip;
    correlationStorage.run(
        { correlationId, method: req.method, path, ip, userAgent },
        () => {
            next();
        },
    );
}
