import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { BookingsModule } from "../bookings/bookings.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import {
    CourseEnrollmentsController,
    CoursesController,
} from "./courses.controller";
import { CoursesService } from "./courses.service";

/** Courses: dated sessions, the people on them, and their bookings (ADR-007). */
@Module({
    imports: [
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
        BookingsModule,
        InvoicesModule,
    ],
    controllers: [CoursesController, CourseEnrollmentsController],
    providers: [CoursesService, OrganizationGuard],
    exports: [CoursesService],
})
export class CoursesModule {}
