import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { DiscountsController } from "./discounts.controller";
import { DiscountsService } from "./discounts.service";

/** Discount codes, owned by the business (plan 2026-09-20-001). */
@Module({
    imports: [forwardRef(() => OrganizationsModule), CapabilitiesModule],
    controllers: [DiscountsController],
    providers: [DiscountsService, OrganizationGuard],
    exports: [DiscountsService],
})
export class DiscountsModule {}
