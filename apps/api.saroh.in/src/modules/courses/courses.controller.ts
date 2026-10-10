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

import { LifecycleWrite } from "../../common/decorators/lifecycle-write.decorator";
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
 * Courses (ADR-007): its own module, which needs Appointments because its
 * sessions are bookings on a service. Enrolling invoices when Payments is
 * on, which the service decides. Authorization is in the service.
 *
 * Courses is required per handler, not on the class (#117): making or
 * changing a course, its sessions, and enrolling carry
 * `@RequireModule("COURSES")`. The courses, one course with its sessions and
 * enrolments, are history and stay readable with Courses off; cancelling an
 * enrolment already made is winding down, and stays open too
 * (`MODULE_ROLLOUT.md`). `course:*` still applies.
 */
@Controller("organizations/:organizationId/courses")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
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
    @RequireModule("COURSES")
    @HttpCode(201)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CourseInputDto,
    ) {
        return this.courses.create(ctx, dto);
    }

    @Patch(":courseId")
    @RequireModule("COURSES")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("courseId") id: string,
        @Body() dto: CourseInputDto,
    ) {
        return this.courses.update(ctx, id, dto);
    }

    @Post(":courseId/sessions")
    @RequireModule("COURSES")
    @HttpCode(201)
    addSession(
        @OrgContext() ctx: OrganizationContext,
        @Param("courseId") id: string,
        @Body() dto: AddSessionDto,
    ) {
        return this.courses.addSession(ctx, id, dto);
    }

    @Delete(":courseId/sessions/:sessionId")
    @RequireModule("COURSES")
    @HttpCode(200)
    removeSession(
        @OrgContext() ctx: OrganizationContext,
        @Param("courseId") id: string,
        @Param("sessionId") sessionId: string,
    ) {
        return this.courses.removeSession(ctx, id, sessionId);
    }

    @Post(":courseId/enrollments")
    @RequireModule("COURSES")
    @HttpCode(201)
    enrol(
        @OrgContext() ctx: OrganizationContext,
        @Param("courseId") id: string,
        @Body() dto: EnrolDto,
    ) {
        return this.courses.enrol(ctx, id, dto);
    }

    @Post(":courseId/enrollments/:enrollmentId/cancel")
    @LifecycleWrite("wind-down")
    @HttpCode(200)
    cancelEnrollment(
        @OrgContext() ctx: OrganizationContext,
        @Param("courseId") id: string,
        @Param("enrollmentId") enrollmentId: string,
    ) {
        return this.courses.cancelEnrollment(ctx, id, enrollmentId);
    }
}

/**
 * A person's enrolments across courses, for their contact page (ADR-007).
 * History: readable with Courses off (#117), so no module gate.
 */
@Controller("organizations/:organizationId/course-enrollments")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
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
