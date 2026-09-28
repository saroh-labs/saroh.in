import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { env } from "../../env";
import { AnalyticsCoreModule } from "../analytics/analytics-core.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PaymentsModule } from "../payments/payments.module";
import { AccountBookingsTabController } from "../site-accounts/account-bookings-tab.controller";
import { AccountBookingsController } from "../site-accounts/account-bookings.controller";
import { AccountBookingsService } from "../site-accounts/account-bookings.service";
import { AccountWaitlistController } from "../site-accounts/account-waitlist.controller";
import { SiteAccountsModule } from "../site-accounts/site-accounts.module";
import {
    BOOKING_NOTIFY_TYPE,
    BookingNotifyHandler,
} from "./booking-notify.handler";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import {
    PublicBookingPageController,
    PublicBookingsController,
} from "./public-bookings.controller";
import { PublicBookingsService } from "./public-bookings.service";
import { PublicTodayService } from "./public-today";
import {
    RELEASE_HOLDS_TYPE,
    ReleaseHoldsHandler,
} from "./release-holds.handler";
import {
    WAITLIST_OFFER_TYPE,
    WaitlistOfferHandler,
} from "./waitlist-offer.handler";
import { WaitlistController } from "./waitlist.controller";
import { WaitlistService } from "./waitlist.service";

const CHAIN_CHECK_MS = 15 * 60 * 1000;

/**
 * Bookable Services, availability and public booking (S4-002).
 *
 * Serves BOTH an authenticated management surface (the org-scoped
 * {@link BookingsController}, which needs {@link OrganizationsModule} via
 * forwardRef for the `OrganizationContextService` that `OrganizationGuard`
 * uses) and a guardless public surface (the {@link PublicBookingsController}
 * booking command, whose org is derived from the target Service). The first
 * is served by {@link BookingsService}, the second by
 * {@link PublicBookingsService}; both write through the same reservation.
 * A signed-in customer books through {@link AccountBookingsController}
 * (round-2 A9), on the same service and limiter, and moves and cancels
 * their own bookings through {@link AccountBookingsTabController} (A6), on
 * the same writes as the team's. A full class's waitlist (A12) is joined
 * from the booking page ({@link AccountWaitlistController}), read by the
 * team ({@link WaitlistController}), and offered by `waitlist.offer`.
 */
@Module({
    imports: [
        forwardRef(() => OrganizationsModule),
        AnalyticsCoreModule,
        CapabilitiesModule,
        JobsModule,
        // Sends a cancel's refund of money paid online (E8).
        PaymentsModule,
        // The customer session guard for signed-in booking (A9), the
        // account area's switch (A6), and the customer notices
        // `booking.notify` delegates to (A14).
        SiteAccountsModule,
    ],
    controllers: [
        BookingsController,
        PublicBookingsController,
        PublicBookingPageController,
        AccountBookingsController,
        AccountBookingsTabController,
        AccountWaitlistController,
        WaitlistController,
    ],
    providers: [
        BookingsService,
        PublicBookingsService,
        PublicTodayService,
        AccountBookingsService,
        ReleaseHoldsHandler,
        BookingNotifyHandler,
        WaitlistService,
        WaitlistOfferHandler,
        OrganizationGuard,
    ],
    exports: [BookingsService],
})
export class BookingsModule implements OnModuleInit, OnModuleDestroy {
    private chainCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly releaseHolds: ReleaseHoldsHandler,
        private readonly bookingNotify: BookingNotifyHandler,
        private readonly waitlistOffer: WaitlistOfferHandler,
    ) {}

    /**
     * Registers `booking.notify` (A14) and the hold release sweep (U19),
     * and starts the sweep's chain — the
     * renewal job's shape (ADR-007): never under test, where no worker runs,
     * and never throwing, so a database not up yet cannot stop the boot.
     */
    async onModuleInit(): Promise<void> {
        this.registry.register(RELEASE_HOLDS_TYPE, this.releaseHolds.handle);
        // Tells the customer, and the team, about a booking (A14).
        this.registry.register(BOOKING_NOTIFY_TYPE, this.bookingNotify.handle);
        // Offers a freed place in a class to the first in line (A12).
        this.registry.register(WAITLIST_OFFER_TYPE, this.waitlistOffer.handle);
        if (env.NODE_ENV === "test") return;
        await this.releaseHolds.schedule(new Date());
        this.chainCheck = setInterval(() => {
            void this.releaseHolds.ensureScheduled();
        }, CHAIN_CHECK_MS);
        this.chainCheck.unref();
    }

    onModuleDestroy(): void {
        clearInterval(this.chainCheck);
    }
}
