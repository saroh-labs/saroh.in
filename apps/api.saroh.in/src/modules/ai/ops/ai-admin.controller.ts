import { Body, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import type { AiReportStatus, AiRequestStatus } from "@saroh/database";
import type { Edition } from "@saroh/edition";
import { Type } from "class-transformer";
import {
    IsBoolean,
    IsDate,
    IsDefined,
    IsIn,
    IsInt,
    IsOptional,
    Min,
} from "class-validator";

import type { PlatformAdminInfo } from "../../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../../common/decorators/require-admin-permission.decorator";
import {
    AdminAuditOutcome,
    AdminAuditService,
} from "../../admin/admin-audit.service";
import { ServedEdition } from "../../admin/admin-edition";
import { AdminPermission } from "../../admin/admin-permissions";
import { AdminRoutes } from "../../admin/admin-routes.decorator";
import { OperatorReasonDto } from "../../admin/dto";
import { AiReportsService } from "../reports/ai-reports.service";
import { AiOpsAdminService } from "./ai-ops-admin.service";

class SetAiSettingDto extends OperatorReasonDto {
    /** Checked against the key's schema by the settings store. */
    @IsDefined()
    value!: unknown;
}

class SetAiOverrideDto extends SetAiSettingDto {
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    expiresAt?: Date;
}

class AiHaltDto extends OperatorReasonDto {
    @IsBoolean()
    halted!: boolean;
}

class AiListDto {
    @IsOptional()
    @IsIn(["OPEN", "GRANTED", "DECLINED", "RESOLVED"])
    status?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;
}

/**
 * The console's Ask AI page (DEC-220, plan 2026-11-13-001 U8), under
 * `/admin/ask-ai`. Registered by the admin module, so its guard stack and
 * permission contract cover every route. Settings, the halt and a
 * business's override need `ai-settings:write` (Platform owners only), as
 * do Grant and Decline, which add a paid add-on; reports need
 * `ai-reports:read` (personal data) and each one opened is on the ledger.
 * The rest reads with `platform:read`, numbers and names only.
 */
@AdminRoutes()
export class AdminAskAiController {
    constructor(
        private readonly ops: AiOpsAdminService,
        private readonly reports: AiReportsService,
        private readonly adminAudit: AdminAuditService,
    ) {}

    @Get("ask-ai/summary")
    @RequireAdminPermission(AdminPermission.PlatformRead)
    askAiSummary() {
        return this.ops.summary();
    }

    @Get("ask-ai/settings")
    @RequireAdminPermission(AdminPermission.PlatformRead)
    askAiSettings() {
        return this.ops.listSettings();
    }

    @Get("ask-ai/settings/:key/history")
    @RequireAdminPermission(AdminPermission.PlatformRead)
    askAiSettingHistory(@Param("key") key: string) {
        return this.ops.history(key);
    }

    @Post("ask-ai/settings/:key")
    @HttpCode(200)
    @RequireAdminPermission(AdminPermission.AiSettingsWrite)
    setAskAiSetting(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("key") key: string,
        @Body() dto: SetAiSettingDto,
    ) {
        return this.ops.set(
            key,
            dto.value,
            dto.reason,
            { userId: staff.userId },
            (tx) =>
                this.adminAudit.write(tx, {
                    actorUserId: staff.userId,
                    permission: AdminPermission.AiSettingsWrite,
                    action: "ai.setting.set",
                    targetType: "ai_setting",
                    targetId: key,
                    reason: dto.reason,
                    outcome: AdminAuditOutcome.Success,
                    idempotencyKey: dto.idempotencyKey,
                }),
        );
    }

    /** The Saroh-wide halt, on or off, with a reason. */
    @Post("ask-ai/halt")
    @HttpCode(200)
    @RequireAdminPermission(AdminPermission.AiSettingsWrite)
    setAskAiHalt(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: AiHaltDto,
    ) {
        return this.ops.set(
            "ai.halt",
            dto.halted,
            dto.reason,
            { userId: staff.userId },
            (tx) =>
                this.adminAudit.write(tx, {
                    actorUserId: staff.userId,
                    permission: AdminPermission.AiSettingsWrite,
                    action: dto.halted ? "ai.halt.on" : "ai.halt.off",
                    targetType: "ai_setting",
                    targetId: "ai.halt",
                    reason: dto.reason,
                    outcome: AdminAuditOutcome.Success,
                    idempotencyKey: dto.idempotencyKey,
                }),
        );
    }

    @Post("ask-ai/businesses/:organizationId/overrides/:key")
    @HttpCode(204)
    @RequireAdminPermission(AdminPermission.AiSettingsWrite)
    async setAskAiOverride(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Param("key") key: string,
        @Body() dto: SetAiOverrideDto,
    ): Promise<void> {
        await this.ops.setOverride(
            organizationId,
            key,
            dto.value,
            dto.reason,
            { userId: staff.userId },
            dto.expiresAt,
            (tx) =>
                this.adminAudit.write(tx, {
                    actorUserId: staff.userId,
                    permission: AdminPermission.AiSettingsWrite,
                    action: "ai.override.set",
                    targetType: "ai_setting",
                    targetId: key,
                    organizationId,
                    reason: dto.reason,
                    outcome: AdminAuditOutcome.Success,
                    idempotencyKey: dto.idempotencyKey,
                    metadata: {
                        expiresAt: dto.expiresAt?.toISOString() ?? null,
                    },
                }),
        );
    }

    @Post("ask-ai/businesses/:organizationId/overrides/:key/end")
    @HttpCode(204)
    @RequireAdminPermission(AdminPermission.AiSettingsWrite)
    async endAskAiOverride(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Param("key") key: string,
        @Body() dto: OperatorReasonDto,
    ): Promise<void> {
        await this.ops.endOverride(
            organizationId,
            key,
            dto.reason,
            { userId: staff.userId },
            (tx) =>
                this.adminAudit.write(tx, {
                    actorUserId: staff.userId,
                    permission: AdminPermission.AiSettingsWrite,
                    action: "ai.override.end",
                    targetType: "ai_setting",
                    targetId: key,
                    organizationId,
                    reason: dto.reason,
                    outcome: AdminAuditOutcome.Success,
                    idempotencyKey: dto.idempotencyKey,
                }),
        );
    }

    @Get("ask-ai/requests")
    @RequireAdminPermission(AdminPermission.OrganizationRead)
    askAiRequests(
        @ServedEdition() edition: Edition | null,
        @Query() query: AiListDto,
    ) {
        return this.ops.listRequests(
            edition,
            query.status as AiRequestStatus | undefined,
        );
    }

    /** One pack of the plan's Ask AI add-on, for this period only. */
    @Post("ask-ai/requests/:requestId/grant")
    @HttpCode(204)
    @RequireAdminPermission(AdminPermission.AiSettingsWrite)
    async grantAskAiRequest(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("requestId") requestId: string,
        @Body() dto: OperatorReasonDto,
    ): Promise<void> {
        await this.ops.grant(requestId, staff.userId, dto.reason);
        await this.decided(staff, requestId, "ai.request.grant", dto);
    }

    @Post("ask-ai/requests/:requestId/decline")
    @HttpCode(204)
    @RequireAdminPermission(AdminPermission.AiSettingsWrite)
    async declineAskAiRequest(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("requestId") requestId: string,
        @Body() dto: OperatorReasonDto,
    ): Promise<void> {
        await this.ops.decline(requestId, staff.userId, dto.reason);
        await this.decided(staff, requestId, "ai.request.decline", dto);
    }

    @Get("ask-ai/reports")
    @RequireAdminPermission(AdminPermission.AiReportsRead)
    async askAiReports(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @ServedEdition() edition: Edition | null,
        @Query() query: AiListDto,
    ) {
        const rows = await this.reports.list(
            edition,
            query.status as AiReportStatus | undefined,
            query.page,
        );
        await this.adminAudit.recordRead({
            actorUserId: staff.userId,
            permission: AdminPermission.AiReportsRead,
            action: "ai.report.list",
            targetType: "ai_report",
            outcome: AdminAuditOutcome.Success,
            metadata: { resultCount: rows.length },
        });
        return rows;
    }

    /** One report opened: the question, answer and note. Always on the ledger. */
    @Get("ask-ai/reports/:reportId")
    @RequireAdminPermission(AdminPermission.AiReportsRead)
    async askAiReport(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @ServedEdition() edition: Edition | null,
        @Param("reportId") reportId: string,
    ) {
        const report = await this.reports.read(reportId, edition);
        await this.adminAudit.recordRead({
            actorUserId: staff.userId,
            permission: AdminPermission.AiReportsRead,
            action: "ai.report.read",
            targetType: "ai_report",
            targetId: reportId,
            organizationId: report.organizationId,
            outcome: AdminAuditOutcome.Success,
        });
        return report;
    }

    @Post("ask-ai/reports/:reportId/resolve")
    @HttpCode(204)
    @RequireAdminPermission(AdminPermission.AiReportsRead)
    async resolveAskAiReport(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("reportId") reportId: string,
        @Body() dto: OperatorReasonDto,
    ): Promise<void> {
        const { organizationId } = await this.reports.resolve(
            reportId,
            staff.userId,
        );
        await this.adminAudit.recordRead({
            actorUserId: staff.userId,
            permission: AdminPermission.AiReportsRead,
            action: "ai.report.resolve",
            targetType: "ai_report",
            targetId: reportId,
            organizationId,
            reason: dto.reason,
            outcome: AdminAuditOutcome.Success,
            idempotencyKey: dto.idempotencyKey,
        });
    }

    /** A grant or decline on the ledger, once it's done. */
    private async decided(
        staff: PlatformAdminInfo,
        requestId: string,
        action: string,
        dto: OperatorReasonDto,
    ): Promise<void> {
        await this.adminAudit.recordRead({
            actorUserId: staff.userId,
            permission: AdminPermission.AiSettingsWrite,
            action,
            targetType: "ai_request",
            targetId: requestId,
            organizationId:
                (await this.ops.requestBusiness(requestId)) ?? undefined,
            reason: dto.reason,
            outcome: AdminAuditOutcome.Success,
            idempotencyKey: dto.idempotencyKey,
        });
    }
}
