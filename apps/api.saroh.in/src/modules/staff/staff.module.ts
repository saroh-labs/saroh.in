import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import {
    ClosuresController,
    TimeOffPreviewController,
} from "./closures.controller";
import { ClosuresService } from "./closures.service";
import {
    RuleRequestsController,
    StaffRulesController,
} from "./staff-rules.controller";
import { StaffRulesService } from "./staff-rules.service";
import { BookingRulesController, StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";

/**
 * Staff who take bookings, their hours, time off and extra hours, and the
 * business's booking rules (U3, ADR-008). The slot engine that reads them
 * lives in the bookings module; this module only writes them.
 */
@Module({
    imports: [forwardRef(() => OrganizationsModule), CapabilitiesModule],
    controllers: [
        StaffController,
        StaffRulesController,
        RuleRequestsController,
        BookingRulesController,
        ClosuresController,
        TimeOffPreviewController,
    ],
    providers: [
        StaffService,
        StaffRulesService,
        ClosuresService,
        OrganizationGuard,
    ],
    exports: [StaffService, StaffRulesService, ClosuresService],
})
export class StaffModule {}
