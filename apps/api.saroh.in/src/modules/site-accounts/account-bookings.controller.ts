import {
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";

import type { PublicCredit } from "../bookings/booking-credit";
import type { PublicBookingResult } from "../bookings/public-bookings.controller";
import { publicBookingResult } from "../bookings/public-bookings.controller";
import { PublicBookingsService } from "../bookings/public-bookings.service";
import type { PayInstructionsView } from "../organizations/business-pay-instructions";
import { businessPayInstructionsOf } from "../organizations/business-pay-instructions";
import type { CustomerContext } from "./customer-context.decorator";
import { CurrentCustomer } from "./customer-context.decorator";
import { CustomerSessionGuard } from "./customer-session.guard";
import { AccountBookDto, AccountCreditQueryDto } from "./dto";
import type { SiteRelay } from "./site-relay";
import { RelayContext } from "./site-relay";

/**
 * Booking as a signed-in customer (round-2 plan A, A9; ADR-011), mounted at
 * `POST /public/site-accounts/bookings`. It is how every merchant site's
 * booking page books now: sign-in is always on, and there is no guest path.
 *
 * Behind {@link CustomerSessionGuard}: the site's signed relay and a live
 * session for that very site, so the business is the one the host resolves
 * to and the handler runs in its RLS context. The booker is the account's
 * contact, and the booking names the account. The same person holding the
 * same session twice is a 409 "You're already booked for this."
 *
 * Registered by `BookingsModule`, which owns the booking service and its
 * rate limiter; it lives here with the other customer routes.
 */
@Controller("public/site-accounts")
@UseGuards(CustomerSessionGuard)
export class AccountBookingsController {
    constructor(private readonly bookings: PublicBookingsService) {}

    @Post("bookings")
    @HttpCode(HttpStatus.CREATED)
    @Header("Cache-Control", "no-store")
    async book(
        @CurrentCustomer() customer: CustomerContext,
        @RelayContext() relay: SiteRelay,
        @Body() dto: AccountBookDto,
    ): Promise<
        PublicBookingResult & { payInstructions?: PayInstructionsView | null }
    > {
        const { booking, payToken } = await this.bookings.bookOnline(
            dto.serviceId,
            {
                startAt: dto.startAt,
                bookerName: dto.bookerName,
                // Replaced by the account's own before anything is written.
                bookerEmail: "",
                idempotencyKey: dto.idempotencyKey,
                staffId: dto.staffId,
                pay: dto.pay,
                locationType: dto.locationType,
                intakeNote: dto.intakeNote,
                packPurchaseId: dto.packPurchaseId,
                subscriptionId: dto.subscriptionId,
            },
            // The visitor's address, as the site's server relayed it: the
            // API only ever sees that server's.
            relay.clientHash,
            new Date(),
            {
                organizationId: customer.organizationId,
                accountId: customer.accountId,
                contactId: customer.contactId,
            },
        );
        const result = publicBookingResult(booking, payToken);
        // Booked to pay at the desk (R32): how to pay the business ahead,
        // if it says — the customer's own booking, in the business the
        // session resolved to.
        return booking.paidWith === "DESK" &&
            !payToken &&
            result.state === "CONFIRMED"
            ? {
                  ...result,
                  payInstructions: await businessPayInstructionsOf(
                      customer.organizationId,
                  ),
              }
            : result;
    }

    /**
     * The credit the pay step offers (A10): one class from the customer's
     * own pack or membership for this service at this time, or null. The
     * booking names what this gave it (`pay: "CREDIT"`) and is checked
     * again under the pack's or the membership's lock.
     */
    @Get("bookings/credit")
    @Header("Cache-Control", "no-store")
    credit(
        @CurrentCustomer() customer: CustomerContext,
        @Query() query: AccountCreditQueryDto,
    ): Promise<{ credit: PublicCredit | null }> {
        return this.bookings.creditFor(
            {
                organizationId: customer.organizationId,
                accountId: customer.accountId,
                contactId: customer.contactId,
            },
            query.serviceId,
            query.startAt,
        );
    }
}
