import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { AccountAreaGuard } from "../site-accounts/account-area";
import { PostMessageDto } from "../site-accounts/dto";
import { ThreadsService } from "../site-accounts/threads.service";

/**
 * A customer's message thread, from the team's side (round-2 A13): read on
 * Customer Detail with `message:read`, answered with `message:write`. The
 * thread is the one the customer writes in from their account on the
 * business's site (`site-accounts/threads.service.ts`).
 *
 * Dark with the account area: while `SITE_ACCOUNT_AREA` is off these are
 * 404s, so the team is never offered a thread no customer can see.
 */
@Controller("organizations/:organizationId/customers/:contactId/thread")
@UseGuards(BetterAuthGuard, OrganizationGuard, AccountAreaGuard)
export class CustomerThreadsController {
    constructor(private readonly threads: ThreadsService) {}

    @Get()
    read(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
    ) {
        return this.threads.forStaff(ctx, contactId);
    }

    /** The team opened it: the customer's messages are read. */
    @Post("read")
    @HttpCode(200)
    markRead(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
    ) {
        return this.threads.markReadByStaff(ctx, contactId);
    }

    /** Answer the customer. */
    @Post("messages")
    @HttpCode(201)
    reply(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
        @Body() dto: PostMessageDto,
    ) {
        return this.threads.reply(ctx, contactId, dto.text);
    }
}
