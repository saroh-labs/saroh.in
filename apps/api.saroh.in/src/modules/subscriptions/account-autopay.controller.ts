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
    Matches,
    MaxLength,
    MinLength,
} from "class-validator";

import type { AutopayOutcome, AutopayStart } from "../payments/autopay.service";
import type { MandateMethod } from "../payments/providers/provider.port";
import { MANDATE_METHODS } from "../payments/providers/provider.port";
import { AccountAreaGuard } from "../site-accounts/account-area";
import type { CustomerContext } from "../site-accounts/customer-context.decorator";
import { CurrentCustomer } from "../site-accounts/customer-context.decorator";
import { CustomerSessionGuard } from "../site-accounts/customer-session.guard";
import type { AccountJoinAutopay } from "./account-autopay.service";
import { AccountAutopayService } from "./account-autopay.service";

/**
 * Turning autopay on: the method the customer picked from the offer, and an
 * idempotency key. No amount and no limit: the server sets both from the
 * plan. Any other field is a 400 (`forbidNonWhitelisted`).
 */
export class AccountAutopayDto {
    @IsIn(MANDATE_METHODS)
    method!: MandateMethod;

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    @Matches(/^[A-Za-z0-9_-]+$/)
    idempotencyKey?: string;
}

/**
 * Autopay from the customer's own account on the business's site (round-2
 * D12; ADR-011), at `/public/site-accounts/me/autopay`: "Set up autopay"
 * and "Change how autopay pays" on My plan, and the page they land on
 * afterwards. Every `:ref` is looked up with the signed-in customer's
 * contact, so another customer's plan — even in the same business — is a
 * 404 and no mandate is made.
 *
 * Behind the account area's switch and the customer's session, as every
 * `me` route is. Registered by `SubscriptionsModule`.
 */
@Controller("public/site-accounts/me/autopay")
@UseGuards(AccountAreaGuard, CustomerSessionGuard)
export class AccountAutopayController {
    constructor(private readonly autopay: AccountAutopayService) {}

    /** Start autopay on their plan `:ref`, with the method they picked. */
    @Post("plans/:ref")
    @HttpCode(HttpStatus.CREATED)
    @Header("Cache-Control", "no-store")
    start(
        @CurrentCustomer() customer: CustomerContext,
        @Param("ref") ref: string,
        @Body() dto: AccountAutopayDto,
    ): Promise<AutopayStart> {
        return this.autopay.start(
            customer,
            ref,
            dto.method,
            dto.idempotencyKey,
        );
    }

    /** How their plan's autopay stands, for the page after set-up. */
    @Get("plans/:ref")
    @Header("Cache-Control", "no-store")
    plan(
        @CurrentCustomer() customer: CustomerContext,
        @Param("ref") ref: string,
    ): Promise<AutopayOutcome> {
        return this.autopay.outcome(customer, ref);
    }

    /** A plan joined with autopay from the Prices page (G20): how it stands. */
    @Get("joins/:ref")
    @Header("Cache-Control", "no-store")
    join(
        @CurrentCustomer() customer: CustomerContext,
        @Param("ref") ref: string,
    ): Promise<AccountJoinAutopay> {
        return this.autopay.join(customer, ref);
    }
}
