import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { CommunicationsModule } from "../communications/communications.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { InvoiceSendService } from "./invoice-send.service";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";

/**
 * Invoices a business issues (ADR-007). Exports the service so
 * subscriptions, courses and class packs can issue on their own transaction.
 */
@Module({
    imports: [
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
        CommunicationsModule,
    ],
    controllers: [InvoicesController],
    providers: [InvoicesService, InvoiceSendService, OrganizationGuard],
    exports: [InvoicesService],
})
export class InvoicesModule {}
