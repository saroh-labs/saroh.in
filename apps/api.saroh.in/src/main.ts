import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { getTrustedOrigins } from "@saroh/auth";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { correlationIdMiddleware } from "./common/logging/correlation-id.middleware";
import { LoggingInterceptor } from "./common/logging/logging.interceptor";
import { structuredLogger } from "./common/logging/structured-logger";

async function bootstrap() {
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
        origin: process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()) ?? [
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

    // One structured request log line per request, and a single consistent
    // error envelope for every thrown error.
    app.useGlobalInterceptors(new LoggingInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());

    const port = parseInt(process.env.PORT ?? "3333", 10);
    await app.listen(port);

    const environment = process.env.NODE_ENV ?? "development";
    structuredLogger.info("api_started", { port, environment });
}

bootstrap().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    structuredLogger.error("bootstrap_failed", { message });
    process.exit(1);
});
