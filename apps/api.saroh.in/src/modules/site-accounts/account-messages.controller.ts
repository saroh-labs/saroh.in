import {
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    Post,
    UseGuards,
} from "@nestjs/common";

import { AccountAreaGuard } from "./account-area";
import type { CustomerContext } from "./customer-context.decorator";
import { CurrentCustomer } from "./customer-context.decorator";
import { CustomerSessionGuard } from "./customer-session.guard";
import type { AccountMessage, AccountThread } from "./customer-view";
import { PostMessageDto } from "./dto";
import { ThreadsService } from "./threads.service";

/**
 * Messages, in the customer's account on a merchant's site (round-2 A13):
 * their one thread with the business, mounted at
 * `/public/site-accounts/me/messages`.
 *
 * Behind {@link AccountAreaGuard} (a 404 until `SITE_ACCOUNT_AREA=on`), then
 * {@link CustomerSessionGuard}: the site's signed relay and a live session
 * for that very site, so a revoked session is a 401 and the thread is only
 * ever the signed-in customer's own, in their business's RLS context.
 */
@Controller("public/site-accounts/me/messages")
@UseGuards(AccountAreaGuard, CustomerSessionGuard)
export class AccountMessagesController {
    constructor(private readonly threads: ThreadsService) {}

    /** The thread, oldest first; opening it clears the unread dot. */
    @Get()
    @Header("Cache-Control", "no-store")
    list(@CurrentCustomer() customer: CustomerContext): Promise<AccountThread> {
        return this.threads.forCustomer(customer);
    }

    /** Write to the business. Limited per account (429 with a sentence). */
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @Header("Cache-Control", "no-store")
    post(
        @CurrentCustomer() customer: CustomerContext,
        @Body() dto: PostMessageDto,
    ): Promise<AccountMessage> {
        return this.threads.postFromCustomer(customer, dto.text);
    }
}
