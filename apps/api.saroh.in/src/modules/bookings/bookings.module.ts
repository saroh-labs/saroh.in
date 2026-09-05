import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { AnalyticsCoreModule } from "../analytics/analytics-core.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { PublicBookingsController } from "./public-bookings.controller";

/**
 * Bookable Services, availability and public booking (S4-002).
 *
 * Serves BOTH an authenticated management surface (the org-scoped
 * {@link BookingsController}, which needs {@link OrganizationsModule} via
 * forwardRef for the `OrganizationContextService` that `OrganizationGuard`
 * uses) and a guardless public surface (the {@link PublicBookingsController}
 * booking command, whose org is derived from the target Service). Both share the
 * single {@link BookingsService}.
 */
@Module({
    imports: [
        forwardRef(() => OrganizationsModule),
        AnalyticsCoreModule,
        CapabilitiesModule,
    ],
    controllers: [BookingsController, PublicBookingsController],
    providers: [BookingsService, OrganizationGuard],
    exports: [BookingsService],
})
export class BookingsModule {}
