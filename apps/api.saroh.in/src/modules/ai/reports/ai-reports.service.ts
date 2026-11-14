import { randomUUID } from "node:crypto";

import {
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { AiReportReason, AiReportStatus } from "@saroh/database";
import { outsideOrgContext, prisma } from "@saroh/database";
import type { Edition } from "@saroh/edition";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { viaBusiness } from "../../admin/admin-edition";
import type { AiReportContent } from "../history/sealing";
import {
    openMessageBody,
    openReportBody,
    sealReportBody,
} from "../history/sealing";

/** A report as the console lists it: no text. */
export interface AiReportRow {
    id: string;
    organizationId: string;
    businessName: string;
    reason: AiReportReason;
    status: AiReportStatus;
    createdAt: string;
}

/** One report opened in the console: the chosen question, answer and note. */
export interface AiReportView extends AiReportRow, AiReportContent {
    userId: string;
    resolvedAt: string | null;
}

/** A bound on one console page, not a plan limit. */
export const REPORTS_PAGE = 50;

const ROW = {
    id: true,
    organizationId: true,
    reason: true,
    status: true,
    createdAt: true,
    organization: { select: { name: true } },
} as const;

const row = (r: {
    id: string;
    organizationId: string;
    reason: AiReportReason;
    status: AiReportStatus;
    createdAt: Date;
    organization: { name: string };
}): AiReportRow => ({
    id: r.id,
    organizationId: r.organizationId,
    businessName: r.organization.name,
    reason: r.reason,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
});

/**
 * Report this answer (DEC-220, plan 2026-11-13-001 U8). A person reports
 * one answer of their own; the answer and the question before it are
 * opened and copied into the report, sealed again with the note and bound
 * to the report's row, so the console sees that one exchange and nothing
 * else of the conversation. Reporting never counts and touches no usage.
 */
@Injectable()
export class AiReportsService {
    async report(
        ctx: OrganizationContext,
        input: { messageId: string; reason: AiReportReason; note?: string },
    ): Promise<{ id: string; createdAt: string }> {
        const answer = await prisma.aiMessage.findFirst({
            where: {
                id: input.messageId,
                organizationId: ctx.organizationId,
                role: "ASSISTANT",
                outcome: { not: null },
                conversation: { userId: ctx.userId },
            },
            select: {
                id: true,
                conversationId: true,
                createdAt: true,
                bodyCiphertext: true,
                bodyIv: true,
                bodyAuthTag: true,
            },
        });
        if (!answer) throw new NotFoundException("That answer isn't here");
        const question = await prisma.aiMessage.findFirst({
            where: {
                conversationId: answer.conversationId,
                role: "USER",
                createdAt: { lte: answer.createdAt },
                id: { not: answer.id },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: {
                id: true,
                bodyCiphertext: true,
                bodyIv: true,
                bodyAuthTag: true,
            },
        });
        const where = {
            organizationId: ctx.organizationId,
            conversationId: answer.conversationId,
        };
        const open = (m: {
            id: string;
            bodyCiphertext: string;
            bodyIv: string;
            bodyAuthTag: string;
        }) =>
            openMessageBody(
                {
                    ciphertext: m.bodyCiphertext,
                    iv: m.bodyIv,
                    authTag: m.bodyAuthTag,
                },
                { ...where, rowId: m.id },
            ).text;

        const id = randomUUID();
        // An empty note is no note.
        const note = input.note?.trim() ? input.note.trim() : null;
        const sealed = sealReportBody(
            {
                question: question ? open(question) : "",
                answer: open(answer),
                note,
            },
            { ...where, rowId: id },
        );
        try {
            const made = await prisma.aiReport.create({
                data: {
                    id,
                    ...where,
                    userId: ctx.userId,
                    messageId: answer.id,
                    reason: input.reason,
                    bodyCiphertext: sealed.ciphertext,
                    bodyIv: sealed.iv,
                    bodyAuthTag: sealed.authTag,
                },
                select: { id: true, createdAt: true },
            });
            return { id: made.id, createdAt: made.createdAt.toISOString() };
        } catch (error) {
            if ((error as { code?: string }).code === "P2002") {
                throw new ConflictException(
                    "You've already reported this answer.",
                );
            }
            throw error;
        }
    }

    /** The console's list, newest first; text stays sealed. */
    list(
        edition: Edition | null,
        status?: AiReportStatus,
        page = 1,
    ): Promise<AiReportRow[]> {
        // CROSS-TENANT: the console's, behind ai-reports:read.
        return outsideOrgContext(async () =>
            (
                await prisma.aiReport.findMany({
                    where: {
                        ...(status ? { status } : {}),
                        ...viaBusiness(edition),
                    },
                    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                    skip: (Math.max(1, page) - 1) * REPORTS_PAGE,
                    take: REPORTS_PAGE,
                    select: ROW,
                })
            ).map(row),
        );
    }

    /** One report, opened. The caller records the read. */
    read(id: string, edition: Edition | null): Promise<AiReportView> {
        return outsideOrgContext(async () => {
            const r = await prisma.aiReport.findFirst({
                where: { id, ...viaBusiness(edition) },
                select: {
                    ...ROW,
                    userId: true,
                    conversationId: true,
                    resolvedAt: true,
                    bodyCiphertext: true,
                    bodyIv: true,
                    bodyAuthTag: true,
                },
            });
            if (!r) throw new NotFoundException("No such report.");
            return {
                ...row(r),
                ...openReportBody(
                    {
                        ciphertext: r.bodyCiphertext,
                        iv: r.bodyIv,
                        authTag: r.bodyAuthTag,
                    },
                    {
                        organizationId: r.organizationId,
                        conversationId: r.conversationId,
                        rowId: r.id,
                    },
                ),
                userId: r.userId,
                resolvedAt: r.resolvedAt?.toISOString() ?? null,
            };
        });
    }

    /** Mark a report looked at. Returns its business, for the ledger. */
    resolve(
        id: string,
        staffUserId: string,
        now: Date = new Date(),
    ): Promise<{ organizationId: string }> {
        return outsideOrgContext(async () => {
            const { count } = await prisma.aiReport.updateMany({
                where: { id, status: "OPEN" },
                data: {
                    status: "RESOLVED",
                    resolvedByUserId: staffUserId,
                    resolvedAt: now,
                },
            });
            const r = await prisma.aiReport.findUnique({
                where: { id },
                select: { organizationId: true },
            });
            if (!r) throw new NotFoundException("No such report.");
            if (count === 0) {
                throw new ConflictException("That report is already resolved.");
            }
            return r;
        });
    }
}
