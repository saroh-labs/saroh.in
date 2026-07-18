import {
    BadRequestException,
    HttpException,
    HttpStatus,
    InternalServerErrorException,
    NotFoundException,
    type ArgumentsHost,
} from "@nestjs/common";

import { AllExceptionsFilter } from "./all-exceptions.filter";

interface CapturedResponse {
    statusCode?: number;
    body?: unknown;
    headers: Record<string, string>;
    headersSent: boolean;
    setHeader: jest.Mock;
    status: jest.Mock;
    json: jest.Mock;
}

function makeResponse(): CapturedResponse {
    const res: CapturedResponse = {
        headers: {},
        headersSent: false,
        setHeader: jest.fn((k: string, v: string) => {
            res.headers[k] = v;
        }),
        status: jest.fn((code: number) => {
            res.statusCode = code;
            return res;
        }),
        json: jest.fn((body: unknown) => {
            res.body = body;
            return res;
        }),
    };
    return res;
}

function makeHost(
    res: CapturedResponse,
    req: Record<string, unknown> = {
        method: "GET",
        originalUrl: "/x",
        correlationId: "cid-123",
        headers: {},
    },
): ArgumentsHost {
    return {
        switchToHttp: () => ({
            getResponse: () => res,
            getRequest: () => req,
        }),
    } as unknown as ArgumentsHost;
}

function envelope(res: CapturedResponse): {
    code: string;
    message: string;
    statusCode: number;
    correlationId: string;
    details?: unknown;
} {
    return (res.body as { error: ReturnType<typeof envelope> }).error;
}

describe("AllExceptionsFilter", () => {
    const filter = new AllExceptionsFilter();

    it("maps a Nest HttpException to its status and a stable code", () => {
        const res = makeResponse();
        filter.catch(new NotFoundException("store missing"), makeHost(res));

        expect(res.statusCode).toBe(404);
        const err = envelope(res);
        expect(err.code).toBe("NOT_FOUND");
        expect(err.message).toBe("store missing");
        expect(err.statusCode).toBe(404);
        expect(err.correlationId).toBe("cid-123");
    });

    it("echoes the correlation id on the response header", () => {
        const res = makeResponse();
        filter.catch(new BadRequestException("bad"), makeHost(res));
        expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", "cid-123");
    });

    it("surfaces class-validator field messages under details", () => {
        const res = makeResponse();
        filter.catch(
            new BadRequestException({
                statusCode: 400,
                message: ["name must not be empty", "price must be a number"],
                error: "Bad Request",
            }),
            makeHost(res),
        );

        const err = envelope(res);
        expect(err.code).toBe("BAD_REQUEST");
        expect(err.message).toBe("Validation failed");
        expect(err.details).toEqual([
            "name must not be empty",
            "price must be a number",
        ]);
    });

    it("collapses an unknown error into an opaque 500 (no leak)", () => {
        const res = makeResponse();
        const secret = "connect ECONNREFUSED 10.0.0.5:5432 password=hunter2";
        filter.catch(new Error(secret), makeHost(res));

        expect(res.statusCode).toBe(500);
        const err = envelope(res);
        expect(err.code).toBe("INTERNAL_SERVER_ERROR");
        expect(err.message).toBe("Internal server error");
        expect(err.correlationId).toBe("cid-123");
        // The internal message / stack must not reach the client body.
        expect(JSON.stringify(res.body)).not.toContain("hunter2");
        expect(JSON.stringify(res.body)).not.toContain("ECONNREFUSED");
    });

    it("treats a 5xx HttpException as generic too", () => {
        const res = makeResponse();
        filter.catch(
            new InternalServerErrorException("db pool exhausted"),
            makeHost(res),
        );
        const err = envelope(res);
        expect(err.statusCode).toBe(500);
        expect(err.message).toBe("Internal server error");
        expect(JSON.stringify(res.body)).not.toContain("db pool");
    });

    it("falls back to 'unknown' correlation id when middleware did not run", () => {
        const res = makeResponse();
        filter.catch(
            new HttpException("teapot", HttpStatus.I_AM_A_TEAPOT),
            makeHost(res, { method: "GET", originalUrl: "/x", headers: {} }),
        );
        expect(envelope(res).correlationId).toBe("unknown");
    });

    it("does not write when the response was already sent", () => {
        const res = makeResponse();
        res.headersSent = true;
        filter.catch(new NotFoundException(), makeHost(res));
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });
});
