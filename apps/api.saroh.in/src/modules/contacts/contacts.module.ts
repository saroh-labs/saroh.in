import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PaymentsModule } from "../payments/payments.module";
import { ContactSearchController } from "./contact-search.controller";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";

/**
 * Org-owned CRM Contacts (S3-005). Imports {@link OrganizationsModule} (via
 * forwardRef) for the `OrganizationContextService` that `OrganizationGuard`
 * needs, and provides the guard so the controller's `@UseGuards` can resolve it.
 */
@Module({
    imports: [
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
        // D20: a hard delete cancels their autopay at the provider first.
        PaymentsModule,
    ],
    // The search first: its literal "search" must win over `:contactId`.
    controllers: [ContactSearchController, ContactsController],
    providers: [ContactsService, OrganizationGuard],
    exports: [ContactsService],
})
export class ContactsModule {}
