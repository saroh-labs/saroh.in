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
import { logHttpRequestOnce } from "./http-request-log";

/**
 * Emits one structured log line per request — correlation id, method, path,
 * resolved status and duration — on both success and failure. It never logs
 * request/response bodies or headers, so no PII passes through here; the
 * exception filter adds a redacted diagnostic line for 5xx only.
 *
 * Interceptors run AFTER guards, so requests rejected by a guard never get here
 * — `AllExceptionsFilter` emits their line instead, via the same shared
 * once-only emitter.
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

        return next.handle().pipe(
            tap({
                next: () => {
                    logHttpRequestOnce(req, res.statusCode);
                },
                error: (err: unknown) => {
                    const statusCode =
                        err instanceof HttpException
                            ? err.getStatus()
                            : HttpStatus.INTERNAL_SERVER_ERROR;
                    logHttpRequestOnce(req, statusCode);
                },
            }),
        );
    }
}
