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
import {
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from "class-validator";

import type { MandateMethod } from "../payments/providers/provider.port";
import { MANDATE_METHODS } from "../payments/providers/provider.port";

import { AccountAreaGuard } from "../site-accounts/account-area";
import type { CustomerContext } from "../site-accounts/customer-context.decorator";
import { CurrentCustomer } from "../site-accounts/customer-context.decorator";
import { CustomerSessionGuard } from "../site-accounts/customer-session.guard";
import type {
    AccountPlanJoin,
    AccountPlanJoinAttempt,
} from "./public-plan-join.service";
import { PublicPlanJoinService } from "./public-plan-join.service";

/**
 * What starting to join takes: an idempotency key, so a retry of the same
 * start returns the same intent. Nothing else — above all no amount, price
 * or way to pay: with the global pipe's `forbidNonWhitelisted`, any other
 * field is a 400. The plan is the path's `:ref`. `autopay` is the method
 * the customer picked to turn autopay on with (D12), from the business's
 * provider's own list; absent: just pay for this period.
 */
export class AccountJoinPlanDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(255)
    idempotencyKey?: string;

    @IsOptional()
    @IsIn(MANDATE_METHODS)
    autopay?: MandateMethod;
}

/**
 * Joining a plan from the site's Prices page or Plans block (round-2 G20),
 * at `/public/site-accounts/me/plans`: starting to pay for one, and how a
 * started payment stands. The plans themselves are listed by the public
 * read (`public/sites/:siteId/plans`).
 *
 * Behind the account area's switch and the customer's session, as every
 * `me` route is (`account.controller.ts`). Registered by
 * `SubscriptionsModule`, beside the Plan tab's controller.
 */
@Controller("public/site-accounts/me/plans")
@UseGuards(AccountAreaGuard, CustomerSessionGuard)
export class AccountPlanJoinController {
    constructor(private readonly joins: PublicPlanJoinService) {}

    /** Start paying to join a plan: its draft and the provider's handoff. */
    @Post(":ref/join")
    @HttpCode(HttpStatus.CREATED)
    @Header("Cache-Control", "no-store")
    join(
        @CurrentCustomer() customer: CustomerContext,
        @Param("ref") ref: string,
        @Body() dto: AccountJoinPlanDto,
    ): Promise<AccountPlanJoin> {
        return this.joins.start(
            customer,
            ref,
            dto.idempotencyKey,
            new Date(),
            dto.autopay,
        );
    }

    /** How a started join stands: paying, joined or closed. */
    @Get("joins/:ref")
    @Header("Cache-Control", "no-store")
    standing(
        @CurrentCustomer() customer: CustomerContext,
        @Param("ref") ref: string,
    ): Promise<AccountPlanJoinAttempt> {
        return this.joins.standing(customer, ref);
    }
}
