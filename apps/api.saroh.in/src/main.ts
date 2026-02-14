import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";

import { AppModule } from "./app.module";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // Security
    app.use(helmet());

    // CORS
    app.enableCors({
        origin: process.env.CORS_ORIGIN?.split(",") || [
            "http://localhost:3000",
        ],
        credentials: true,
    });

    // Global validation pipe
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: {
                enableImplicitConversion: true,
            },
        }),
    );

    const port = parseInt(process.env.PORT || "3000", 10);
    await app.listen(port);

    const environment = process.env.NODE_ENV || "development";
    console.log(`🚀 API Server running on port ${port} (${environment})`);
}

bootstrap().catch((error) => {
    console.error("Failed to bootstrap application:", error.message);
    process.exit(1);
});
