import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { getTrustedOrigins } from "@saroh/auth";
import helmet from "helmet";

import { AppModule } from "./app.module";

async function bootstrap() {
    // Better Auth reads the raw request body, so Nest's body parser must be
    // disabled here; AuthModule re-adds JSON/urlencoded for the other routes.
    const app = await NestFactory.create(AppModule, { bodyParser: false });

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

    const port = parseInt(process.env.PORT || "3333", 10);
    await app.listen(port);

    const environment = process.env.NODE_ENV || "development";
    console.log(
        `🚀 API + Auth server running on port ${port} (${environment})`,
    );
}

bootstrap().catch((error) => {
    console.error("Failed to bootstrap application:", error.message);
    process.exit(1);
});
