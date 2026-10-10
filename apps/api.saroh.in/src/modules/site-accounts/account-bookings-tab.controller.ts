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

import { notTakingOrders } from "../billing/paused-errors";
import { takingNewActivity } from "../orders/checkout-paused";
import { AccountAreaGuard } from "./account-area";
import type {
    AccountBookingRow,
    AccountBookings,
    AccountCancelResult,
    AccountTimes,
    AccountTreatment,
} from "./account-bookings-view";
import { AccountBookingsService } from "./account-bookings.service";
import type { CustomerContext } from "./customer-context.decorator";
import { CurrentCustomer } from "./customer-context.decorator";
import { CustomerSessionGuard } from "./customer-session.guard";
import { AccountBookingTimeDto } from "./dto";

/**
 * The account's Bookings on a merchant's site (round-2 plan A, A6; ADR-011),
 * at `/public/site-accounts/me/bookings` and `/me/treatments`.
 *
 * Guarded as the rest of the account area (`account.controller.ts`): a 404
 * until `SITE_ACCOUNT_AREA=on`, then the site's signed relay and a live
 * session for that very site. The site's server calls these; a browser
 * never does. Every answer is built by `account-bookings-view.ts`.
 *
 * Registered by `BookingsModule`, which owns the booking writes and the
 * payments service a cancel's refund is sent through (as A9's booking
 * route is); it lives here with the other customer routes.
 */
@Controller("public/site-accounts/me")
@UseGuards(AccountAreaGuard, CustomerSessionGuard)
export class AccountBookingsTabController {
    constructor(private readonly bookings: AccountBookingsService) {}

    /** Coming up, Past, Cancelled, and the customer's treatments. */
    @Get("bookings")
    @Header("Cache-Control", "no-store")
    list(
        @CurrentCustomer() customer: CustomerContext,
    ): Promise<AccountBookings> {
        return this.bookings.list(customer);
    }

    /** One booking. Another customer's is a 404. */
    @Get("bookings/:ref")
    @Header("Cache-Control", "no-store")
    one(
        @CurrentCustomer() customer: CustomerContext,
        @Param("ref") ref: string,
    ): Promise<AccountBookingRow> {
        return this.bookings.one(customer, ref);
    }

    /** Free times to move a one-to-one to, with the same person. */
    @Get("bookings/:ref/times")
    @Header("Cache-Control", "no-store")
    times(
        @CurrentCustomer() customer: CustomerContext,
        @Param("ref") ref: string,
    ): Promise<AccountTimes> {
        return this.bookings.moveTimes(customer, ref);
    }

    @Post("bookings/:ref/move")
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    async move(
        @CurrentCustomer() customer: CustomerContext,
        @Param("ref") ref: string,
        @Body() dto: AccountBookingTimeDto,
    ): Promise<AccountBookingRow> {
        await assertTakingBookings(customer);
        return this.bookings.move(customer, ref, dto.startAt);
    }

    @Post("bookings/:ref/cancel")
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    cancel(
        @CurrentCustomer() customer: CustomerContext,
        @Param("ref") ref: string,
    ): Promise<AccountCancelResult> {
        return this.bookings.cancel(customer, ref);
    }

    /** Free times for a treatment's next visit. */
    @Get("treatments/:orderRef/times")
    @Header("Cache-Control", "no-store")
    visitTimes(
        @CurrentCustomer() customer: CustomerContext,
        @Param("orderRef") orderRef: string,
    ): Promise<AccountTimes & { visit: number }> {
        return this.bookings.visitTimes(customer, orderRef);
    }

    /** Book a treatment's next visit. */
    @Post("treatments/:orderRef/visits")
    @HttpCode(HttpStatus.CREATED)
    @Header("Cache-Control", "no-store")
    async bookVisit(
        @CurrentCustomer() customer: CustomerContext,
        @Param("orderRef") orderRef: string,
        @Body() dto: AccountBookingTimeDto,
    ): Promise<AccountTreatment> {
        await assertTakingBookings(customer);
        return this.bookings.bookVisit(customer, orderRef, dto.startAt);
    }
}

/**
 * Moving a booking or booking a treatment's next visit takes a new time: a
 * business suspended or closing takes none (DEC-120), and the customer
 * hears what a paused site says, never why. Cancelling stays open.
 */
async function assertTakingBookings(customer: CustomerContext): Promise<void> {
    if (!(await takingNewActivity(customer.organizationId))) {
        throw notTakingOrders("bookings");
    }
}
