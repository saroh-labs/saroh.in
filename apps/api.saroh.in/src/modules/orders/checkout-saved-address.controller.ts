import { Controller, Get, Header, Param, UseGuards } from "@nestjs/common";

import { PublicSiteOnlineGuard } from "../../common/guards/public-site-online.guard";
import type { CustomerContext } from "../site-accounts/customer-context.decorator";
import { CurrentCustomer } from "../site-accounts/customer-context.decorator";
import { CustomerSessionGuard } from "../site-accounts/customer-session.guard";
import type { SavedAddress } from "./checkout-saved-address";
import { CheckoutSavedAddressService } from "./checkout-saved-address";

/**
 * Where the signed-in customer's last delivery went, for the bag:
 * `GET public/sites/:siteId/checkout/address`, behind
 * {@link CustomerSessionGuard} (the signed relay and a live session for
 * this very site). The site's server calls it; a browser never does. Not
 * behind the account area: the bag offers it whether or not
 * `SITE_ACCOUNT_AREA` is on. Never cached.
 */
@Controller("public/sites")
@UseGuards(PublicSiteOnlineGuard)
@UseGuards(CustomerSessionGuard)
export class CheckoutSavedAddressController {
    constructor(private readonly addresses: CheckoutSavedAddressService) {}

    @Get(":siteId/checkout/address")
    @Header("Cache-Control", "no-store")
    address(
        @Param("siteId") siteId: string,
        @CurrentCustomer() customer: CustomerContext,
    ): Promise<{ address: SavedAddress | null }> {
        return this.addresses.lastAddress(siteId, customer);
    }
}
