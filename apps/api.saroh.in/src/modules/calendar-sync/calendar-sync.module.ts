import type { OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationContextModule } from "../organizations/organization-context.module";
import {
    CalendarCallbackController,
    CalendarConnectController,
} from "./calendar-connect.controller";
import { CalendarConnectService } from "./calendar-connect.service";
import { CalendarLapseService } from "./calendar-lapse.service";
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
    ],
})
export class CalendarSyncModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly sync: CalendarSyncHandler,
    ) {}

    onModuleInit(): void {
        // A booking's event in Google, made, moved or deleted (U5).
        this.registry.register(CALENDAR_SYNC_TYPE, this.sync.handle);
    }
}
