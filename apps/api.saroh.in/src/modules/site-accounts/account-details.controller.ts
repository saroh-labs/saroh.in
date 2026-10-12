import {
    Body,
    Controller,
    Get,
    Header,
    Patch,
    UseGuards,
} from "@nestjs/common";

import { AccountAreaGuard } from "./account-area";
import {
    readCourses,
    readNotices,
    readWaitlist,
    writeNotices,
} from "./account-details-reads";
import type { CustomerContext } from "./customer-context.decorator";
import { CurrentCustomer } from "./customer-context.decorator";
import { CustomerSessionGuard } from "./customer-session.guard";
import type {
    AccountCourse,
    AccountNotices,
    AccountWaitlistPlace,
} from "./customer-view";
import { UpdateNoticesDto } from "./dto";

/**
 * The rest of "all their details" in the customer's account (DEC-142;
 * ADR-011), at `/public/site-accounts/me`: their places in a class's line,
 * their courses, and whether the business may email them. Open invoices are
 * `account-invoices.controller.ts`, which needs the invoices service.
 *
 * Guarded as the rest of the account area (`account.controller.ts`): a 404
 * until `SITE_ACCOUNT_AREA=on`, then the site's signed relay and a live
 * session for that very site, so every read and the one write are the
 * signed-in customer's own, in their business's RLS context. The site's
 * server calls these; a browser never does. Every answer is built by
 * `customer-view.ts`.
 *
 * Leaving a line is the booking page's own route
 * (`account-waitlist.controller.ts`, `POST waitlist/leave`).
 */
@Controller("public/site-accounts/me")
@UseGuards(AccountAreaGuard, CustomerSessionGuard)
export class AccountDetailsController {
    /** Where they are waiting for a place, and a place held for them. */
    @Get("waitlist")
    @Header("Cache-Control", "no-store")
    waitlist(
        @CurrentCustomer() customer: CustomerContext,
    ): Promise<AccountWaitlistPlace[]> {
        return readWaitlist(customer, new Date());
    }

    /** The courses they hold a seat on. Read-only. */
    @Get("courses")
    @Header("Cache-Control", "no-store")
    courses(
        @CurrentCustomer() customer: CustomerContext,
    ): Promise<AccountCourse[]> {
        return readCourses(customer, new Date());
    }

    /** Whether the business may email them. */
    @Get("notifications")
    @Header("Cache-Control", "no-store")
    notices(
        @CurrentCustomer() customer: CustomerContext,
    ): Promise<AccountNotices> {
        return readNotices(customer);
    }

    /** Their own choice: the consent every send already checks. */
    @Patch("notifications")
    @Header("Cache-Control", "no-store")
    setNotices(
        @CurrentCustomer() customer: CustomerContext,
        @Body() dto: UpdateNoticesDto,
    ): Promise<AccountNotices> {
        return writeNotices(customer, dto.email);
    }
}
