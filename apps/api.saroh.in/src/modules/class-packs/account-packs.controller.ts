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
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { AccountAreaGuard } from "../site-accounts/account-area";
import type { CustomerContext } from "../site-accounts/customer-context.decorator";
import { CurrentCustomer } from "../site-accounts/customer-context.decorator";
import { CustomerSessionGuard } from "../site-accounts/customer-session.guard";
import type {
    AccountPackAttempt,
    AccountPackCheckout,
    AccountPacksOnSale,
} from "../site-accounts/customer-view";
import { PublicPackPurchaseService } from "./public-pack-purchase.service";

/**
 * What starting a pack purchase takes: an idempotency key, so a retry of
 * the same start returns the same intent. Nothing else — above all no
 * amount or price: with the global pipe's `forbidNonWhitelisted`, any other
 * field is a 400. The pack is the path's `:ref`.
 */
export class AccountBuyPackDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(255)
    idempotencyKey?: string;
}

/**
 * Buying a class pack from the account on a merchant's site (round-2 plan
 * A, A11), at `/public/site-accounts/me/packs`: the packs on sale, starting
 * to pay for one, and how a started payment stands.
 *
 * Behind the account area's switch and the customer's session, as every
 * `me` route is (`account.controller.ts`). Registered by `ClassPacksModule`,
 * as `SubscriptionsModule` registers the Plan tab's controller, so
 * `SiteAccountsModule` stays free of the workspace's modules.
 */
@Controller("public/site-accounts/me/packs")
@UseGuards(AccountAreaGuard, CustomerSessionGuard)
export class AccountPacksController {
    constructor(private readonly packs: PublicPackPurchaseService) {}

    @Get()
    @Header("Cache-Control", "no-store")
    onSale(
        @CurrentCustomer() customer: CustomerContext,
    ): Promise<AccountPacksOnSale> {
        return this.packs.onSale(customer);
    }

    /** Start paying for a pack: its draft and the provider's handoff. */
    @Post(":ref/buy")
    @HttpCode(HttpStatus.CREATED)
    @Header("Cache-Control", "no-store")
    buy(
        @CurrentCustomer() customer: CustomerContext,
        @Param("ref") ref: string,
        @Body() dto: AccountBuyPackDto,
    ): Promise<AccountPackCheckout> {
        return this.packs.start(customer, ref, dto.idempotencyKey);
    }

    /** How a started payment stands: paying, bought or closed. */
    @Get("payments/:ref")
    @Header("Cache-Control", "no-store")
    standing(
        @CurrentCustomer() customer: CustomerContext,
        @Param("ref") ref: string,
    ): Promise<AccountPackAttempt> {
        return this.packs.standing(customer, ref);
    }
}
