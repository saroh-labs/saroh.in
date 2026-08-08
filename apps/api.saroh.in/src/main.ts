import "reflect-metadata";
// MUST be the first non-polyfill import, and MUST stay a bare side-effect
// import.
//
// `./env` is the only thing that calls dotenv, and the imports below are sorted
// alphabetically by prettier-plugin-organize-imports — which put "./app.module"
// ahead of "./env". CommonJS evaluates requires in source order, so `AppModule`
// (and through it `@saroh/database`) was fully evaluated BEFORE any .env file
// was read. `@saroh/database` builds its Postgres adapter at module scope from
// `process.env.DATABASE_URL`, so it got `undefined` and node-postgres quietly
// fell back to its own default of localhost:5432 — every query then failed with
// ECONNREFUSED against a database nobody was running.
//
// A bare `import "..."` is NOT pulled into the sorted block (which is why
// "reflect-metadata" survives above it), so this ordering holds under the
// formatter. The named `env` import further down resolves from the module
// cache and does not re-run anything.
import "./env";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { getTrustedOrigins } from "@saroh/auth";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { OriginGuard } from "./common/guards/origin.guard";
import { OrgRlsInterceptor } from "./common/interceptors/org-rls.interceptor";
import { correlationIdMiddleware } from "./common/logging/correlation-id.middleware";
import { LoggingInterceptor } from "./common/logging/logging.interceptor";
import { structuredLogger } from "./common/logging/structured-logger";
import { env } from "./env";

/**
 * Last line of defence against a library's own timers killing the process.
 *
 * The api died in exactly this way: Neon dropped an idle connection, and the
 * rejection surfaced from `async Timeout.<anonymous>` inside Prisma's
 * transaction-manager — its internal rollback timer firing on a connection
 * that was already gone. That rejection is not reachable from any `await` we
 * own, so no amount of try/catch in our own code could have caught it, and
 * since Node 15 an unhandled rejection terminates the process. The api stayed
 * down until someone noticed.
 *
 * The pool `error` listener in @saroh/database removes the specific cause; this
 * exists because the NEXT one will come from somewhere else. An api that
 * serves every other request fine should not exit because one background timer
 * lost its connection.
 */
function installProcessGuards(): void {
    process.on("unhandledRejection", (reason: unknown) => {
        const error = reason instanceof Error ? reason : undefined;
        structuredLogger.error("unhandled_rejection", {
            message: error?.message ?? String(reason),
            stack: error?.stack,
        });
        // Deliberately NOT exiting. These are overwhelmingly transient I/O —
        // a dropped socket, a timed-out rollback — and the process is still
        // perfectly able to serve traffic.
    });

    process.on("uncaughtException", (error: Error) => {
        structuredLogger.error("uncaught_exception", {
            message: error.message,
            stack: error.stack,
        });
        // This one DOES exit. An exception that escaped every frame leaves the
        // process in an unknown state, and continuing risks serving corrupt
        // data — which is worse than a restart. Exiting non-zero is the signal
        // a supervisor needs; the log line above is what was missing before,
        // when this arrived as a bare stack trace on stderr.
        process.exit(1);
    });
}

async function bootstrap() {
    installProcessGuards();

    // Better Auth reads the raw request body, so Nest's body parser must be
    // disabled here; AuthModule re-adds JSON/urlencoded for the other routes.
    const app = await NestFactory.create(AppModule, { bodyParser: false });

    // Runs first so every request (incl. the mounted Better Auth handler) gets
    // a correlation id and its logs/error envelope can be traced.
    app.use(correlationIdMiddleware);

    app.use(helmet());

    // Credentialed CORS for every *.saroh.in frontend (never "*" with creds).
    const devOrigins = Array.from(
        { length: 13 },
        (_, i) => `http://localhost:${3000 + i}`,
    );
    app.enableCors({
        origin: env.CORS_ORIGIN?.split(",").map((o) => o.trim()) ?? [
            ...getTrustedOrigins(),
            ...devOrigins,
        ],
        credentials: true,
    });

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
        }),
    );

    // App-layer CSRF origin check (B3): reject a present-but-untrusted Origin/
    // Referer on unsafe methods for authenticated routes (defense-in-depth on
    // top of the SameSite session cookie + CORS). Public/webhook routes and
    // Better Auth's own routes are exempt inside the guard.
    app.useGlobalGuards(new OriginGuard());

    // OrgRlsInterceptor first (outermost): it opens the per-request RLS org
    // context so the handler's DB work runs inside it. A no-op unless
    // RLS_ENFORCEMENT is enabled. Then one structured request log line per
    // request, and a single consistent error envelope for every thrown error.
    app.useGlobalInterceptors(
        new OrgRlsInterceptor(),
        new LoggingInterceptor(),
    );
    app.useGlobalFilters(new AllExceptionsFilter());

    const port = env.PORT;
    await app.listen(port);

    const environment = env.NODE_ENV;
    structuredLogger.info("api_started", { port, environment });
}

bootstrap().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    structuredLogger.error("bootstrap_failed", { message });
    process.exit(1);
});
