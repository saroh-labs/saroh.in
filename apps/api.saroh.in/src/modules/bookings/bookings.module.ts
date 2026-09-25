import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { env } from "../../env";
import { AnalyticsCoreModule } from "../analytics/analytics-core.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import {
    PublicBookingPageController,
    PublicBookingsController,
} from "./public-bookings.controller";
import { PublicBookingsService } from "./public-bookings.service";
import {
    RELEASE_HOLDS_TYPE,
    ReleaseHoldsHandler,
} from "./release-holds.handler";

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
 */
@Module({
    imports: [
        forwardRef(() => OrganizationsModule),
        AnalyticsCoreModule,
        CapabilitiesModule,
        JobsModule,
    ],
    controllers: [
        BookingsController,
        PublicBookingsController,
        PublicBookingPageController,
    ],
    providers: [
        BookingsService,
        PublicBookingsService,
        ReleaseHoldsHandler,
        OrganizationGuard,
    ],
    exports: [BookingsService],
})
export class BookingsModule implements OnModuleInit, OnModuleDestroy {
    private chainCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly releaseHolds: ReleaseHoldsHandler,
    ) {}

    /**
     * Registers the hold release sweep (U19) and starts its chain — the
     * renewal job's shape (ADR-007): never under test, where no worker runs,
     * and never throwing, so a database not up yet cannot stop the boot.
     */
    async onModuleInit(): Promise<void> {
        this.registry.register(RELEASE_HOLDS_TYPE, this.releaseHolds.handle);
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
