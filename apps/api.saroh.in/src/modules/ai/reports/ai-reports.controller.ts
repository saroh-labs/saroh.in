import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import type { AiReportReason } from "@saroh/database";
import {
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from "class-validator";

import { OrgContext } from "../../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../../common/guards/organization.guard";
import type { OrganizationContext } from "../../../common/types/organization-context";
import { AiReportsService } from "./ai-reports.service";

export const AI_REPORT_REASONS = [
    "WRONG_NUMBER",
    "DIDNT_UNDERSTAND",
    "SOMETHING_ELSE",
] as const satisfies readonly AiReportReason[];

/** `POST …/ask-ai/reports`: one answer of the asker's own. */
export class AiReportDto {
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    messageId!: string;

    @IsIn(AI_REPORT_REASONS)
    reason!: AiReportReason;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    note?: string;
}

/**
 * Report this answer (plan 2026-11-13-001 U8): the asker sends Saroh one
 * of their own answers, with the question before it. Any member may
 * report their own; history stays theirs with Ask AI off, so this needs
 * no switch. It never counts.
 */
@Controller("organizations/:organizationId/ask-ai/reports")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class AskAiReportsController {
    constructor(private readonly reports: AiReportsService) {}

    @Post()
    @HttpCode(201)
    report(
        @OrgContext() ctx: OrganizationContext,
        @Body() body: AiReportDto,
    ): Promise<{ id: string; createdAt: string }> {
        return this.reports.report(ctx, body);
    }
}
