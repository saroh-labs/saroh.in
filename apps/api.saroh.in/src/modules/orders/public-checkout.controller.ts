import {
    Body,
    Controller,
    Get,
    Header,
    Headers,
    HttpCode,
    HttpStatus,
    Ip,
    Param,
    Post,
    UseGuards,
} from "@nestjs/common";

import { AllowOnTestRelease } from "../../common/decorators/allow-on-test-release.decorator";
import type { CustomerContext } from "../site-accounts/customer-context.decorator";
import { CurrentCustomer } from "../site-accounts/customer-context.decorator";
import { CustomerSessionGuard } from "../site-accounts/customer-session.guard";
import type { SiteRelay } from "../site-accounts/site-relay";
import {
    RelayContext,
    SITE_RELAY_HEADER,
    visitorKey,
} from "../site-accounts/site-relay";
import { CheckoutQuoteDto, CheckoutStartDto } from "./checkout.dto";
import type {
    CheckoutOptions,
    CheckoutStanding,
    CheckoutStarted,
    PricedBag,
} from "./public-checkout.service";
import { PublicCheckoutService } from "./public-checkout.service";

/**
 * The site's checkout (round-2 G13), under `public/sites/:siteId/checkout`.
 *
 * - `GET  …/checkout/options` — whether this site can take an online order
 *   now, and the ways it leaves. No session.
 * - `POST …/checkout/quote` — the bag priced from listings, and how the
 *   chosen way can be paid. Writes nothing, needs no session.
 * - `POST …/checkout` — behind {@link CustomerSessionGuard}: the unpaid
 *   online order and its intent, or the order to be paid on handover,
 *   idempotent on the sheet's key.
 * - `GET  …/checkout/orders/:orderId` — how a checkout this customer
 *   started stands, while the sheet waits on the payment.
 *
 * On a test release (DEC-071) only the quote answers; `TestHostWriteGuard`
 * refuses the checkout itself with 409 `TEST_RELEASE`.
 *
 * The first two count the visitor by the signed relay's address when
 * saroh.app relays the call (ADR-011), otherwise the caller's own
 * (DEC-027). The service derives the business from the site; nothing in a
 * request names one. Never cached.
 *
 * No `@RequireModule`: a visitor has no organization context, and a
 * checkout must not vanish mid-payment. The service asks whether Commerce
 * is on (`commerceOpen`) before it starts one.
 */
@Controller("public/sites")
export class PublicCheckoutController {
    constructor(private readonly checkout: PublicCheckoutService) {}

    @Get(":siteId/checkout/options")
    @Header("Cache-Control", "no-store")
    options(
        @Param("siteId") siteId: string,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<CheckoutOptions> {
        return this.checkout.options(siteId, visitorKey(ip, relay));
    }

    // Writes nothing, so a test release prices its bag too (DEC-071, KTD-8).
    @Post(":siteId/checkout/quote")
    @AllowOnTestRelease()
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    quote(
        @Param("siteId") siteId: string,
        @Body() dto: CheckoutQuoteDto,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<PricedBag> {
        return this.checkout.quote(siteId, dto, visitorKey(ip, relay));
    }

    @Post(":siteId/checkout")
    @UseGuards(CustomerSessionGuard)
    @HttpCode(HttpStatus.CREATED)
    @Header("Cache-Control", "no-store")
    start(
        @Param("siteId") siteId: string,
        @CurrentCustomer() customer: CustomerContext,
        @RelayContext() relay: SiteRelay,
        @Body() dto: CheckoutStartDto,
    ): Promise<CheckoutStarted> {
        return this.checkout.start(siteId, customer, relay.clientHash, dto);
    }

    @Get(":siteId/checkout/orders/:orderId")
    @UseGuards(CustomerSessionGuard)
    @Header("Cache-Control", "no-store")
    standing(
        @Param("siteId") siteId: string,
        @Param("orderId") orderId: string,
        @CurrentCustomer() customer: CustomerContext,
    ): Promise<CheckoutStanding> {
        return this.checkout.standing(siteId, customer, orderId);
    }
}
