import { Body, Get, Param, Post, Query } from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { AdminHealthService } from "./admin-health.service";
import { AdminMachineryService } from "./admin-machinery.service";
import { AdminOperationsService } from "./admin-operations.service";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";
import {
    ListJobsDto,
    ListWebhooksDto,
    OperationTargetsDto,
    OperatorReasonDto,
    StartOperationDto,
} from "./dto";

/**
 * The machinery behind the instance (admin console U7–U9): the health
 * board, the job queue, webhook deliveries, provider connections, and the
 * durable operations that retry and replay them — always dry-run first.
 */
@AdminRoutes()
export class AdminMachineryController {
    constructor(
        private readonly health: AdminHealthService,
        private readonly machinery: AdminMachineryService,
        private readonly operations: AdminOperationsService,
    ) {}

    @Get("health")
    @RequireAdminPermission(AdminPermission.PlatformRead)
    board() {
        return this.health.board();
    }

    @Get("jobs/queue")
    @RequireAdminPermission(AdminPermission.JobsRead)
    queue() {
        return this.machinery.queue();
    }

    @Get("jobs")
    @RequireAdminPermission(AdminPermission.JobsRead)
    jobs(@Query() query: ListJobsDto) {
        return this.machinery.jobs(query);
    }

    /** What a retry would do, changing nothing. */
    @Post("jobs/retry/plan")
    @RequireAdminPermission(AdminPermission.JobsRetry)
    planRetry(@Body() dto: OperationTargetsDto) {
        return this.operations.plan("jobs.retry", dto.ids);
    }

    @Post("jobs/retry")
    @RequireAdminPermission(AdminPermission.JobsRetry)
    retry(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: StartOperationDto,
    ) {
        return this.operations.start({
            staff,
            kind: "jobs.retry",
            targetIds: dto.ids,
            reason: dto.reason,
            idempotencyKey: dto.idempotencyKey,
        });
    }

    /**
     * What cancelling would do, changing nothing (#907). Only a job that
     * hasn't started or is waiting to retry is cancelled; the people who
     * retry jobs cancel them.
     */
    @Post("jobs/cancel/plan")
    @RequireAdminPermission(AdminPermission.JobsRetry)
    planCancel(@Body() dto: OperationTargetsDto) {
        return this.operations.plan("jobs.cancel", dto.ids);
    }

    @Post("jobs/cancel")
    @RequireAdminPermission(AdminPermission.JobsRetry)
    cancelJobs(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: StartOperationDto,
    ) {
        return this.operations.start({
            staff,
            kind: "jobs.cancel",
            targetIds: dto.ids,
            reason: dto.reason,
            idempotencyKey: dto.idempotencyKey,
        });
    }

    @Get("webhooks/summary")
    @RequireAdminPermission(AdminPermission.WebhooksRead)
    webhookSummary() {
        return this.machinery.webhookSummary();
    }

    @Get("webhooks")
    @RequireAdminPermission(AdminPermission.WebhooksRead)
    webhooks(@Query() query: ListWebhooksDto) {
        return this.machinery.webhooks(query);
    }

    /** What a replay would do, changing nothing. */
    @Post("webhooks/replay/plan")
    @RequireAdminPermission(AdminPermission.WebhooksReplay)
    planReplay(@Body() dto: OperationTargetsDto) {
        return this.operations.plan("webhooks.replay", dto.ids);
    }

    @Post("webhooks/replay")
    @RequireAdminPermission(AdminPermission.WebhooksReplay)
    replay(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: StartOperationDto,
    ) {
        return this.operations.start({
            staff,
            kind: "webhooks.replay",
            targetIds: dto.ids,
            reason: dto.reason,
            idempotencyKey: dto.idempotencyKey,
        });
    }

    @Get("operations")
    @RequireAdminPermission(AdminPermission.PlatformRead)
    listOperations() {
        return this.operations.list();
    }

    @Get("operations/:operationId")
    @RequireAdminPermission(AdminPermission.PlatformRead)
    operation(@Param("operationId") operationId: string) {
        return this.operations.get(operationId);
    }

    /**
     * Stop an operation's rows that have not started (#907). Reading it is
     * `platform:read`; cancelling also needs the permission it was started
     * under (a retry's `jobs:retry`, a replay's `webhooks:replay`, …), which
     * the service checks against the operation's kind.
     */
    @Post("operations/:operationId/cancel")
    @RequireAdminPermission(AdminPermission.PlatformRead)
    cancelOperation(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("operationId") operationId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.operations.cancel({
            staff,
            operationId,
            reason: dto.reason,
            idempotencyKey: dto.idempotencyKey,
        });
    }

    @Get("providers")
    @RequireAdminPermission(AdminPermission.ProvidersRead)
    providers() {
        return this.machinery.providers();
    }

    @Post("providers/domains/:domainId/recheck")
    @RequireAdminPermission(AdminPermission.ProvidersRecheck)
    recheckDomain(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("domainId") domainId: string,
    ) {
        return this.machinery.recheckDomain(staff, domainId);
    }
}
