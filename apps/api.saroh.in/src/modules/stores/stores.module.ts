import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { AuditModule } from "../audit/audit.module";
import { BillingModule } from "../billing/billing.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { MediaStorageModule } from "../media/media-storage.module";
import { OrganizationsModule } from "../organizations/organizations.module";

import { LocationLogoService } from "./location-logo.service";
import { StorefrontsController } from "./storefronts.controller";
import { StorefrontsService } from "./storefronts.service";
import { StoresController } from "./stores.controller";
import { StoresService } from "./stores.service";

@Module({
    imports: [
        AuditModule,
        // EntitlementService: the plan's `storefronts` limit on creation.
        BillingModule,
        FeatureFlagModule,
        CapabilitiesModule,
        // MediaService: a location's own logo is an image in the library.
        MediaStorageModule,
        forwardRef(() => OrganizationsModule),
    ],
    controllers: [StoresController, StorefrontsController],
    providers: [
        StoresService,
        StorefrontsService,
        LocationLogoService,
        OrganizationGuard,
    ],
    exports: [StoresService],
})
export class StoresModule {}
