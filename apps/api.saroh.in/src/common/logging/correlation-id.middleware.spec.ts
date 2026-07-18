import type { NextFunction, Request, Response } from "express";

import {
    correlationIdMiddleware,
    type CorrelatedRequest,
} from "./correlation-id.middleware";
import { getCorrelationId } from "./request-context";

function makeReq(headers: Record<string, unknown> = {}): Request {
    return { headers, method: "GET", originalUrl: "/x" } as unknown as Request;
}

function makeRes(): { setHeader: jest.Mock } & Response {
    return { setHeader: jest.fn() } as unknown as {
        setHeader: jest.Mock;
    } & Response;
}

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("correlationIdMiddleware", () => {
    it("mints a UUID when no id header is present and echoes it", () => {
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();

        correlationIdMiddleware(req, res, next as unknown as NextFunction);

        const id = (req as CorrelatedRequest).correlationId;
        expect(id).toMatch(UUID_RE);
        expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", id);
        expect(typeof (req as CorrelatedRequest).startTime).toBe("number");
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("reuses a safe inbound X-Request-Id", () => {
        const req = makeReq({ "x-request-id": "req-abc.123" });
        const res = makeRes();

        correlationIdMiddleware(req, res, jest.fn() as unknown as NextFunction);

        expect((req as CorrelatedRequest).correlationId).toBe("req-abc.123");
        expect(res.setHeader).toHaveBeenCalledWith(
            "X-Request-Id",
            "req-abc.123",
        );
    });

    it("also honours X-Correlation-Id", () => {
        const req = makeReq({ "x-correlation-id": "corr-9" });
        correlationIdMiddleware(
            req,
            makeRes(),
            jest.fn() as unknown as NextFunction,
        );
        expect((req as CorrelatedRequest).correlationId).toBe("corr-9");
    });

    it("rejects an unsafe inbound id (injection) and mints a UUID instead", () => {
        const req = makeReq({ "x-request-id": "evil\r\nSet-Cookie: x=1" });
        correlationIdMiddleware(
            req,
            makeRes(),
            jest.fn() as unknown as NextFunction,
        );
        expect((req as CorrelatedRequest).correlationId).toMatch(UUID_RE);
    });

    it("exposes the id via AsyncLocalStorage during next()", () => {
        const req = makeReq();
        let seen: string | undefined;
        correlationIdMiddleware(req, makeRes(), (() => {
            seen = getCorrelationId();
        }) as unknown as NextFunction);
        expect(seen).toBe((req as CorrelatedRequest).correlationId);
    });
});
