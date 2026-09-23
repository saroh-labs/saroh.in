import { Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { CalendarController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";

/**
 * The Business Calendar's month (U4). Depends on CapabilitiesModule for the
 * module-availability projection (which layers exist) and
 * OrganizationsModule for the OrganizationGuard's context service.
 */
@Module({
    imports: [CapabilitiesModule, OrganizationsModule],
    controllers: [CalendarController],
    providers: [CalendarService, OrganizationGuard],
})
export class CalendarModule {}
