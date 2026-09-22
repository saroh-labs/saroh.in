import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { CoursesService } from "./courses.service";
import {
    AddSessionDto,
    CourseInputDto,
    EnrolDto,
    ListCoursesQueryDto,
    ListEnrollmentsQueryDto,
} from "./dto";

/**
 * Schedule → Courses (ADR-007). Booked time sold as a run of sessions, so it
 * sits under Appointments with bookings. Enrolling invoices when Payments is
 * on, which the service decides. Authorization is in the service.
 */
@Controller("organizations/:organizationId/courses")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("APPOINTMENTS")
export class CoursesController {
    constructor(private readonly courses: CoursesService) {}

    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: ListCoursesQueryDto,
    ) {
        return this.courses.list(ctx, query);
    }

    @Get(":courseId")
    get(@OrgContext() ctx: OrganizationContext, @Param("courseId") id: string) {
        return this.courses.get(ctx, id);
    }

    @Post()
    @HttpCode(201)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CourseInputDto,
    ) {
        return this.courses.create(ctx, dto);
    }

    @Patch(":courseId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("courseId") id: string,
        @Body() dto: CourseInputDto,
    ) {
        return this.courses.update(ctx, id, dto);
    }

    @Post(":courseId/sessions")
    @HttpCode(201)
    addSession(
        @OrgContext() ctx: OrganizationContext,
        @Param("courseId") id: string,
        @Body() dto: AddSessionDto,
    ) {
        return this.courses.addSession(ctx, id, dto);
    }

    @Delete(":courseId/sessions/:sessionId")
    @HttpCode(200)
    removeSession(
        @OrgContext() ctx: OrganizationContext,
        @Param("courseId") id: string,
        @Param("sessionId") sessionId: string,
    ) {
        return this.courses.removeSession(ctx, id, sessionId);
    }

    @Post(":courseId/enrollments")
    @HttpCode(201)
    enrol(
        @OrgContext() ctx: OrganizationContext,
        @Param("courseId") id: string,
        @Body() dto: EnrolDto,
    ) {
        return this.courses.enrol(ctx, id, dto);
    }

    @Post(":courseId/enrollments/:enrollmentId/cancel")
    @HttpCode(200)
    cancelEnrollment(
        @OrgContext() ctx: OrganizationContext,
        @Param("courseId") id: string,
        @Param("enrollmentId") enrollmentId: string,
    ) {
        return this.courses.cancelEnrollment(ctx, id, enrollmentId);
    }
}

/** A person's enrolments across courses, for their contact page (ADR-007). */
@Controller("organizations/:organizationId/course-enrollments")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("APPOINTMENTS")
export class CourseEnrollmentsController {
    constructor(private readonly courses: CoursesService) {}

    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: ListEnrollmentsQueryDto,
    ) {
        return this.courses.listEnrollments(ctx, query);
    }
}
