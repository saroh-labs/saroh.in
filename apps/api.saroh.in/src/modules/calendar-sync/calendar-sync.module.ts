import { Module } from "@nestjs/common";

import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { OrganizationContextModule } from "../organizations/organization-context.module";
import {
    CalendarCallbackController,
    CalendarConnectController,
} from "./calendar-connect.controller";
import { CalendarConnectService } from "./calendar-connect.service";
import { CalendarLapseService } from "./calendar-lapse.service";
import { googleCalendarProvider } from "./google/google-calendar.provider";

/**
 * Google Calendar sync and Meet links (#1047, #1048): a person's own
 * connection, its consent and callback. Producers don't import this
 * module: a booking write queues `calendar.sync` on its own transaction.
 */
@Module({
    imports: [OrganizationContextModule, FeatureFlagModule],
    controllers: [CalendarConnectController, CalendarCallbackController],
    providers: [
        googleCalendarProvider,
        CalendarConnectService,
        CalendarLapseService,
    ],
})
export class CalendarSyncModule {}
