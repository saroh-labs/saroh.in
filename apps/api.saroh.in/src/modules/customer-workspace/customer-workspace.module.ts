import { Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { SiteAccountsModule } from "../site-accounts/site-accounts.module";
import { ContactAttentionService } from "./contact-attention.service";
import { ContactNotesService } from "./contact-notes.service";
import { CustomerDetailService } from "./customer-detail.service";
import { CustomerWorkspaceController } from "./customer-workspace.controller";
import { CustomerWorkspaceService } from "./customer-workspace.service";
import { CustomersListService } from "./customers-list.service";

/**
 * Unified customer workspace (#120). Depends on CapabilitiesModule for the
 * module-availability projection (to gate the timeline) and OrganizationsModule
 * for the OrganizationGuard's context service, and SiteAccountsModule for
 * "This isn't them" on a customer's site account (A4).
 */
@Module({
    imports: [CapabilitiesModule, OrganizationsModule, SiteAccountsModule],
    controllers: [CustomerWorkspaceController],
    providers: [
        CustomerWorkspaceService,
        CustomerDetailService,
        ContactNotesService,
        ContactAttentionService,
        CustomersListService,
        OrganizationGuard,
    ],
})
export class CustomerWorkspaceModule {}
