import { Controller, Get, Header, Param, UseGuards } from "@nestjs/common";

import type { CustomerContext } from "../site-accounts/customer-context.decorator";
import { CurrentCustomer } from "../site-accounts/customer-context.decorator";
import { CustomerSessionGuard } from "../site-accounts/customer-session.guard";
import type { CheckoutConfirmation } from "./checkout-confirmation";
import { CheckoutConfirmationService } from "./checkout-confirmation";

/**
 * The order confirmation page's read (round-2 P4):
 * `GET public/sites/:siteId/checkout/orders/:orderId/confirmation`, behind
 * {@link CustomerSessionGuard} (the signed relay and a live session for
 * this very site). The site's server calls it; a browser never does. Not
 * behind the account area: the customer who just paid reads it whether or
 * not `SITE_ACCOUNT_AREA` is on. Never cached.
 */
@Controller("public/sites")
@UseGuards(CustomerSessionGuard)
export class CheckoutConfirmationController {
    constructor(private readonly confirmations: CheckoutConfirmationService) {}

    @Get(":siteId/checkout/orders/:orderId/confirmation")
    @Header("Cache-Control", "no-store")
    confirmation(
        @Param("siteId") siteId: string,
        @Param("orderId") orderId: string,
        @CurrentCustomer() customer: CustomerContext,
    ): Promise<CheckoutConfirmation> {
        return this.confirmations.confirmation(siteId, customer, orderId);
    }
}
