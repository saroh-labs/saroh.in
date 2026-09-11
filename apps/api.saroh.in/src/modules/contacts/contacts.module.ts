import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";

/**
 * Org-owned CRM Contacts (S3-005). Imports {@link OrganizationsModule} (via
 * forwardRef) for the `OrganizationContextService` that `OrganizationGuard`
 * needs, and provides the guard so the controller's `@UseGuards` can resolve it.
 */
@Module({
    imports: [forwardRef(() => OrganizationsModule), CapabilitiesModule],
    controllers: [ContactsController],
    providers: [ContactsService, OrganizationGuard],
    exports: [ContactsService],
})
export class ContactsModule {}
