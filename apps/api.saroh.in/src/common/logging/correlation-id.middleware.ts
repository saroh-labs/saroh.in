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
    correlationStorage.run({ correlationId }, () => {
        next();
    });
}
