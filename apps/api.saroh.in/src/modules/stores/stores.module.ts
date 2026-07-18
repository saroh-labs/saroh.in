import { Module } from "@nestjs/common";

import { FeatureFlagModule } from "../feature-flags/feature-flags.module";

import { StoresController } from "./stores.controller";
import { StoresService } from "./stores.service";

@Module({
    imports: [FeatureFlagModule],
    controllers: [StoresController],
    providers: [StoresService],
    exports: [StoresService],
})
export class StoresModule {}
