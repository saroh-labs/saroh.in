import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { ContactSearchResult } from "./contact-search";
import { ContactsService } from "./contacts.service";
import { SearchContactsQueryDto } from "./dto";

/**
 * `GET organizations/:organizationId/contacts/search?q=&limit=` (E4): the
 * shared customer picker's search, by name or phone, most recent first.
 *
 * Its own controller, not a route on {@link ContactsController}, for two
 * reasons. It is not gated on the CRM module: New booking and New order
 * (B13) find their customer with it whichever modules are on, as the
 * customer workspace does. And it must be registered before the contacts
 * controller, whose `:contactId` would otherwise take "search" as an id —
 * `ContactsModule` lists it first. The service asks `contact:read`.
 */
@Controller("organizations/:organizationId/contacts/search")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class ContactSearchController {
    constructor(private readonly contacts: ContactsService) {}

    @Get()
    search(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: SearchContactsQueryDto,
    ): Promise<ContactSearchResult[]> {
        return this.contacts.search(ctx, query.q, query.limit);
    }
}
