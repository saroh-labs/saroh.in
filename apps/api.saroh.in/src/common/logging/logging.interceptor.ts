import type {
    CallHandler,
    ExecutionContext,
    NestInterceptor,
} from "@nestjs/common";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { Response } from "express";
import type { Observable } from "rxjs";
import { tap } from "rxjs";

import type { CorrelatedRequest } from "./correlation-id.middleware";
import { structuredLogger } from "./structured-logger";

function logRequest(
    req: CorrelatedRequest,
    statusCode: number,
    start: number,
): void {
    const level = statusCode >= 500 ? "error" : "info";
    structuredLogger[level]("http_request", {
        correlationId: req.correlationId,
        method: req.method,
        path: req.originalUrl,
        statusCode,
        durationMs: Date.now() - start,
    });
}

/**
 * Emits one structured log line per request — correlation id, method, path,
 * resolved status and duration — on both success and failure. It never logs
 * request/response bodies or headers, so no PII passes through here; the
 * exception filter adds a redacted diagnostic line for 5xx only.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<unknown> {
        const http = context.switchToHttp();
        const req = http.getRequest<CorrelatedRequest>();
        const res = http.getResponse<Response>();
        const start = req.startTime;

        return next.handle().pipe(
            tap({
                next: () => {
                    logRequest(req, res.statusCode, start);
                },
                error: (err: unknown) => {
                    const statusCode =
                        err instanceof HttpException
                            ? err.getStatus()
                            : HttpStatus.INTERNAL_SERVER_ERROR;
                    logRequest(req, statusCode, start);
                },
            }),
        );
    }
}
