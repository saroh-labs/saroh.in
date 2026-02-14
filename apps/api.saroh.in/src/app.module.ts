import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";
import { StoresModule } from "./modules/stores/stores.module";

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: [".env.local", ".env"],
        }),
        HealthModule,
        AuthModule,
        StoresModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}
