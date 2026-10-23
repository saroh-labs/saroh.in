import {
    Controller,
    Get,
    Header,
    HttpStatus,
    Post,
    Res,
    UseGuards,
} from "@nestjs/common";

import { AllowOnTestRelease } from "../../common/decorators/allow-on-test-release.decorator";
import { AccountAreaGuard } from "./account-area";
import { AccountDataRequestService } from "./account-data-request.service";
import type { CustomerContext } from "./customer-context.decorator";
import { CurrentCustomer } from "./customer-context.decorator";
import { CustomerSessionGuard } from "./customer-session.guard";
import type { AccountDataRequest } from "./customer-view";

/**
 * "Ask to remove my data" in the customer's Your details (DEC-172, #1106),
 * at `/public/site-accounts/me/data-request`.
 *
 * Guarded as the rest of the account area (`account.controller.ts`): a 404
 * until `SITE_ACCOUNT_AREA=on`, then the site's signed relay and a live
 * session for that very site (`CustomerSessionGuard`), so the request is the
 * signed-in customer's own, in their business's RLS context. Every answer is
 * built by `customer-view.ts`.
 *
 * Asking is allowed from a test release's host (`@AllowOnTestRelease`): it
 * touches only the requesting customer's own record, deletes nothing, and
 * the account's browser test runs there.
 */
@Controller("public/site-accounts/me/data-request")
@UseGuards(AccountAreaGuard, CustomerSessionGuard)
export class AccountDataRequestController {
    constructor(private readonly requests: AccountDataRequestService) {}

    /** Their latest request, or null. */
    @Get()
    @Header("Cache-Control", "no-store")
    current(
        @CurrentCustomer() customer: CustomerContext,
    ): Promise<{ request: AccountDataRequest | null }> {
        return this.requests.current(customer);
    }

    /** Ask: 201 with the new request, 200 with the one already open. */
    @Post()
    @AllowOnTestRelease()
    @Header("Cache-Control", "no-store")
    async ask(
        @CurrentCustomer() customer: CustomerContext,
        @Res({ passthrough: true }) res: { status(code: number): unknown },
    ): Promise<{ request: AccountDataRequest }> {
        const asked = await this.requests.ask(customer);
        res.status(asked.created ? HttpStatus.CREATED : HttpStatus.OK);
        return { request: asked.request };
    }
}
