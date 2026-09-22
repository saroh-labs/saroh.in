import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";

/**
 * Invoices a business issues (ADR-007). Exports the service so
 * subscriptions, courses and class packs can issue on their own transaction.
 */
@Module({
    imports: [forwardRef(() => OrganizationsModule), CapabilitiesModule],
    controllers: [InvoicesController],
    providers: [InvoicesService, OrganizationGuard],
    exports: [InvoicesService],
})
export class InvoicesModule {}
