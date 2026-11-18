import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { env } from "../../env";
import { setGoogleBusyGate } from "../bookings/google-busy-gate";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationContextModule } from "../organizations/organization-context.module";
import { googleBusyAllowed } from "./calendar-allowed";
import {
    CALENDAR_BUSY_TYPE,
    CalendarBusyHandler,
} from "./calendar-busy.handler";
import {
    CalendarCallbackController,
    CalendarConnectController,
} from "./calendar-connect.controller";
import { CalendarConnectService } from "./calendar-connect.service";
import { CalendarLapseService } from "./calendar-lapse.service";
import { CalendarReleaseService } from "./calendar-release.service";
import { CALENDAR_SWEEP_TYPE, CalendarSweepJob } from "./calendar-sweep.job";
import {
    CALENDAR_SYNC_TYPE,
    CalendarSyncHandler,
} from "./calendar-sync.handler";
import { googleCalendarProvider } from "./google/google-calendar.provider";

/**
 * Google Calendar sync and Meet links (#1047, #1048): a person's own
 * connection, its consent and callback, and the jobs that keep Google in
 * step. Producers don't import this
 * module: a booking write queues `calendar.sync` on its own transaction.
 */
@Module({
    imports: [OrganizationContextModule, FeatureFlagModule, JobsModule],
    controllers: [CalendarConnectController, CalendarCallbackController],
    providers: [
        googleCalendarProvider,
        CalendarConnectService,
        CalendarLapseService,
        CalendarSyncHandler,
        CalendarBusyHandler,
        CalendarSweepJob,
        CalendarReleaseService,
    ],
    // Removing someone from the team lets go of their calendar (GC-09).
    exports: [CalendarReleaseService],
})
export class CalendarSyncModule implements OnModuleInit, OnModuleDestroy {
    private chainCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly sync: CalendarSyncHandler,
        private readonly busy: CalendarBusyHandler,
        private readonly sweep: CalendarSweepJob,
    ) {}

    async onModuleInit(): Promise<void> {
        // Slot reads count a person's Google busy times only while allowed.
        setGoogleBusyGate(googleBusyAllowed);
        // A booking's event in Google, made, moved or deleted (U5).
        this.registry.register(CALENDAR_SYNC_TYPE, this.sync.handle);
        // A person's busy times read from Google, every 10 minutes (U6).
        this.registry.register(CALENDAR_BUSY_TYPE, this.busy.handle);
        // The hourly net that restarts stopped busy reads (GC-14).
        this.registry.register(CALENDAR_SWEEP_TYPE, this.sweep.handle);
        if (env.NODE_ENV === "test") return;
        await this.sweep.schedule(new Date());
        this.chainCheck = setInterval(() => {
            void this.sweep.ensureScheduled();
        }, CHAIN_CHECK_MS);
        this.chainCheck.unref();
    }

    onModuleDestroy(): void {
        setGoogleBusyGate(null);
        clearInterval(this.chainCheck);
    }
}

const CHAIN_CHECK_MS = 6 * 60 * 60 * 1000;
