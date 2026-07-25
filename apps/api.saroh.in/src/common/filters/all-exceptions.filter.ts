import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { Catch, HttpException, HttpStatus } from "@nestjs/common";
import type { Request, Response } from "express";

import type { CorrelatedRequest } from "../logging/correlation-id.middleware";
import { logHttpRequestOnce } from "../logging/http-request-log";
import { redactHeaders } from "../logging/redact";
import { RESPONSE_ID_HEADER } from "../logging/request-context";
import { structuredLogger } from "../logging/structured-logger";

/**
 * Error-envelope contract (S0-007)
 * --------------------------------
 * Every error response — and ONLY error responses — is shaped as:
 *
 *   { "error": { "code", "message", "statusCode", "correlationId", "details"? } }
 *
 * - `statusCode` mirrors the HTTP status. `code` is a stable SCREAMING_SNAKE
 *   symbol (e.g. "NOT_FOUND", "INTERNAL_SERVER_ERROR").
 * - `correlationId` matches the `X-Request-Id` response header for support/trace.
 * - `details` is present only for validation errors (the field-level messages).
 * - For any 5xx the message/code are generic ("Internal server error"); the
 *   real error, stack and redacted request headers are logged server-side only,
 *   never sent to the client.
 *
 * Frontend contract: a request "failed" (real outage) iff the transport failed
 * (network error / timeout) OR the response is non-2xx and carries this
 * `error` envelope. A 2xx response is success even when the payload is an empty
 * array/object — empty data must NOT be treated as an error. So:
 *   - network/throw ................. outage → retry / show error UI
 *   - res.ok === false + envelope ... handled error → show error.message
 *   - res.ok === true, body [] / {} . success with no data → show empty state
 */
interface ErrorEnvelope {
    error: {
        code: string;
        message: string;
        statusCode: number;
        correlationId: string;
        details?: unknown;
    };
}

type MaybeCorrelated = Request &
    Partial<Pick<CorrelatedRequest, "correlationId" | "startTime">>;

function statusToCode(status: number): string {
    const name: unknown = (HttpStatus as Record<number, unknown>)[status];
    return typeof name === "string" ? name : "ERROR";
}

function extractClientMessage(exception: HttpException): {
    message: string;
    details?: unknown;
} {
    const response = exception.getResponse();
    if (typeof response === "string") {
        return { message: response };
    }
    const body = response as { message?: unknown };
    if (Array.isArray(body.message)) {
        // class-validator / ValidationPipe returns an array of field messages.
        return { message: "Validation failed", details: body.message };
    }
    if (typeof body.message === "string") {
        return { message: body.message };
    }
    return { message: exception.message };
}

/**
 * Global catch-all filter. Converts any thrown error into the standard error
 * envelope, maps Nest `HttpException`s to their status, and collapses anything
 * unexpected into an opaque 500 so stack traces and internal messages never
 * leak to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const req = ctx.getRequest<MaybeCorrelated>();
        const res = ctx.getResponse<Response>();
        const correlationId = req.correlationId ?? "unknown";

        const isHttp = exception instanceof HttpException;
        const statusCode = isHttp
            ? exception.getStatus()
            : HttpStatus.INTERNAL_SERVER_ERROR;
        const isServerError = statusCode >= 500;

        let code: string;
        let message: string;
        let details: unknown;

        if (isServerError) {
            // Never surface internals for 5xx — generic envelope only.
            code = "INTERNAL_SERVER_ERROR";
            message = "Internal server error";
            structuredLogger.error("unhandled_exception", {
                correlationId,
                method: req.method,
                path: req.originalUrl,
                statusCode,
                errorName:
                    exception instanceof Error
                        ? exception.name
                        : typeof exception,
                errorMessage:
                    exception instanceof Error
                        ? exception.message
                        : String(exception),
                stack: exception instanceof Error ? exception.stack : undefined,
                headers: redactHeaders(req.headers),
            });
        } else {
            code = statusToCode(statusCode);
            ({ message, details } = extractClientMessage(
                exception as HttpException,
            ));
        }

        // Guards run before interceptors, so LoggingInterceptor never sees a
        // guard rejection (401/403). Emit the request line here for anything it
        // missed — a no-op when the interceptor already logged this request.
        logHttpRequestOnce(req, statusCode);

        const envelope: ErrorEnvelope = {
            error: {
                code,
                message,
                statusCode,
                correlationId,
                ...(details !== undefined ? { details } : {}),
            },
        };

        if (!res.headersSent) {
            res.setHeader(RESPONSE_ID_HEADER, correlationId);
            res.status(statusCode).json(envelope);
        }
    }
}
