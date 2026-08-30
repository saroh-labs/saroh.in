import { Module } from "@nestjs/common";

import { StoresModule } from "../stores/stores.module";
import { ImportsController } from "./imports.controller";
import { ImportsService } from "./imports.service";

/**
 * CSV import for products and customers (#175).
 *
 * Depends only on StoresModule: authorization and the owning Organization both
 * come from the store write guard, and row validation reuses the target
 * modules' own DTOs rather than their services.
 */
@Module({
    imports: [StoresModule],
    controllers: [ImportsController],
    providers: [ImportsService],
    exports: [ImportsService],
})
export class ImportsModule {}
