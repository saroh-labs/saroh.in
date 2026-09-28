import { Controller, Get, Header, Param, UseGuards } from "@nestjs/common";

import { AccountAreaGuard } from "./account-area";
import { AccountOrdersService } from "./account-orders.service";
import type { CustomerContext } from "./customer-context.decorator";
import { CurrentCustomer } from "./customer-context.decorator";
import { CustomerSessionGuard } from "./customer-session.guard";
import type { AccountOrder, AccountOrderDetail } from "./customer-view";

/**
 * The account's Orders and Track on a merchant's site (round-2 plan A, A7;
 * ADR-011), at `/public/site-accounts/me/orders`.
 *
 * Guarded as the rest of the account area (`account.controller.ts`): a 404
 * until `SITE_ACCOUNT_AREA=on`, then the site's signed relay and a live
 * session for that very site. The site's server calls these; a browser
 * never does. Every answer is built by `customer-view.ts`.
 */
@Controller("public/site-accounts/me/orders")
@UseGuards(AccountAreaGuard, CustomerSessionGuard)
export class AccountOrdersController {
    constructor(private readonly orders: AccountOrdersService) {}

    /** The customer's orders, newest first. */
    @Get()
    @Header("Cache-Control", "no-store")
    list(
        @CurrentCustomer() customer: CustomerContext,
    ): Promise<AccountOrder[]> {
        return this.orders.list(customer);
    }

    /** One order and its Track. Another customer's is a 404. */
    @Get(":orderId")
    @Header("Cache-Control", "no-store")
    detail(
        @CurrentCustomer() customer: CustomerContext,
        @Param("orderId") orderId: string,
    ): Promise<AccountOrderDetail> {
        return this.orders.detail(customer, orderId);
    }
}
