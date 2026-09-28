import { Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PaymentsModule } from "../payments/payments.module";
import { SiteAccountsModule } from "../site-accounts/site-accounts.module";
import { ContactAttentionService } from "./contact-attention.service";
import { ContactNotesService } from "./contact-notes.service";
import { CustomerDetailService } from "./customer-detail.service";
import { CustomerWorkspaceController } from "./customer-workspace.controller";
import { CustomerWorkspaceService } from "./customer-workspace.service";
import { CustomersListService } from "./customers-list.service";
import { MergeService } from "./merge.service";
import { PrivacyRemovalService } from "./privacy-removal.service";
import { CustomerThreadsController } from "./threads.controller";

/**
 * Unified customer workspace (#120). Depends on CapabilitiesModule for the
 * module-availability projection (to gate the timeline) and OrganizationsModule
 * for the OrganizationGuard's context service, and SiteAccountsModule for
 * "This isn't them" on a customer's site account (A4) and the customer's
 * message thread (A13). PaymentsModule gives a privacy removal (C11) D20's
 * `MandatesService.cancelFor` and the refund a cancelled booking sends.
 */
@Module({
    imports: [
        CapabilitiesModule,
        OrganizationsModule,
        SiteAccountsModule,
        PaymentsModule,
    ],
    controllers: [CustomerWorkspaceController, CustomerThreadsController],
    providers: [
        CustomerWorkspaceService,
        CustomerDetailService,
        ContactNotesService,
        ContactAttentionService,
        CustomersListService,
        MergeService,
        PrivacyRemovalService,
        OrganizationGuard,
    ],
})
export class CustomerWorkspaceModule {}
