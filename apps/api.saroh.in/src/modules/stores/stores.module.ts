import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import { StoresController } from "./stores.controller";
import { StoresService } from "./stores.service";

@Module({
    imports: [
        JwtModule.registerAsync({
            useFactory: (configService: ConfigService) => ({
                secret: configService.get("CUSTOMER_JWT_SECRET", "secret-key"),
                signOptions: {
                    expiresIn: configService.get("JWT_EXPIRES_IN", "24h"),
                },
            }),
            inject: [ConfigService],
        }),
    ],
    controllers: [StoresController],
    providers: [StoresService],
    exports: [StoresService, JwtModule],
})
export class StoresModule {}
