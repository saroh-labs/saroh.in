import {
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    UseGuards,
} from "@nestjs/common";

import { AccountAreaGuard } from "./account-area";
import { AccountPlanService } from "./account-plan.service";
import type { CustomerContext } from "./customer-context.decorator";
import { CurrentCustomer } from "./customer-context.decorator";
import { CustomerSessionGuard } from "./customer-session.guard";
import type { AccountPlanChange, AccountPlanTab } from "./customer-view";
import { AccountPauseDto } from "./dto";

/**
 * The account's Plan tab on a merchant's site (round-2 plan A, A8), at
 * `/public/site-accounts/me/plan`: the member's plans and packs, and pause,
 * resume, cancel and "Pay now" on their own plan.
 *
 * Behind the account area's switch and the customer's session, as every
 * `me` route is (`account.controller.ts`). A `:ref` is a subscription's
 * opaque ref from this tab; another person's is a 404.
 *
 * Registered by `SubscriptionsModule`, which owns the service it acts
 * through, as `BookingsModule` registers `AccountBookingsController`; so
 * `SiteAccountsModule` stays free of the workspace's modules.
 */
@Controller("public/site-accounts/me/plan")
@UseGuards(AccountAreaGuard, CustomerSessionGuard)
export class AccountPlanController {
    constructor(private readonly plan: AccountPlanService) {}

    @Get()
    @Header("Cache-Control", "no-store")
    tab(@CurrentCustomer() customer: CustomerContext): Promise<AccountPlanTab> {
        return this.plan.tab(customer);
    }

    /** Pause for 2, 4 or 8 weeks (403 when the business has it off). */
    @Post(":ref/pause")
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    pause(
        @CurrentCustomer() customer: CustomerContext,
        @Param("ref") ref: string,
        @Body() dto: AccountPauseDto,
    ): Promise<AccountPlanChange> {
        return this.plan.pause(customer, ref, dto.weeks);
    }

    @Post(":ref/resume")
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    resume(
        @CurrentCustomer() customer: CustomerContext,
        @Param("ref") ref: string,
    ): Promise<AccountPlanChange> {
        return this.plan.resume(customer, ref);
    }

    /** Cancel at the end of the period. */
    @Post(":ref/cancel")
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    cancel(
        @CurrentCustomer() customer: CustomerContext,
        @Param("ref") ref: string,
    ): Promise<AccountPlanChange> {
        return this.plan.cancel(customer, ref);
    }

    /** A fresh pay link for the plan's overdue invoice. */
    @Post(":ref/pay")
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    pay(
        @CurrentCustomer() customer: CustomerContext,
        @Param("ref") ref: string,
    ): Promise<{ url: string }> {
        return this.plan.payLink(customer, ref);
    }
}
