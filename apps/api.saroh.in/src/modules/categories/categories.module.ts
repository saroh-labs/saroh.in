import { Module } from "@nestjs/common";

import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { StoresModule } from "../stores/stores.module";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";

@Module({
    imports: [StoresModule, CapabilitiesModule],
    controllers: [CategoriesController],
    providers: [CategoriesService],
    exports: [CategoriesService],
})
export class CategoriesModule {}
