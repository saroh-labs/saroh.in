import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { outsideOrgContext, prisma, runInOrgContext } from "@saroh/database";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { AddonsService } from "../../billing/addons.service";
import { meterWindow } from "../../billing/metering";
import { authorize } from "../../organizations/organization-policy";
import { ASK_AI_MODULE, AskAiAccess } from "../access/ask-ai-access";
import { scheduleGrantEnd } from "../ops/grant-end.job";

/** A Request more as the panel shows it. */
export interface AiRequestView {
    id: string;
    status: "OPEN" | "GRANTED" | "DECLINED";
    createdAt: string;
}

const asBusiness = <T>(organizationId: string, fn: () => Promise<T>) =>
    outsideOrgContext(() => runInOrgContext(organizationId, fn));

/**
 * Request more (DEC-220, plan 2026-11-13-001 U7): when a business's
 * questions run out, whoever may see its plan (`billing:read`: Owner and
 * Admin by default) asks Saroh for more. One open request a business; a
 * second ask returns the first. Saroh's console lists them and grants
 * one (U8) through {@link grant}: packs of the plan's `ask-ai` add-on,
 * which raise the allowance at once (`resolveAccess`) and are billed
 * after the period, as an add-on bought in Settings › Plan is.
 */
@Injectable()
export class AiRequestsService {
    constructor(
        private readonly access: AskAiAccess,
        private readonly addons: AddonsService,
    ) {}

    async requestMore(
        ctx: OrganizationContext,
        now: Date = new Date(),
    ): Promise<AiRequestView> {
        authorize(ctx, "billing:read");
        const entry = await this.access.entry(ctx, now);
        if (!entry.ok) {
            throw new ForbiddenException(
                "Ask AI isn't available to you in this business now.",
            );
        }
        const org = ctx.organizationId;
        const row = await asBusiness(org, () =>
            prisma.$transaction(async (tx) => {
                // One open request a business, however often it's pressed.
                const lock = `ai-request:${org}`;
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))`;
                const open = await tx.aiRequest.findFirst({
                    where: { organizationId: org, status: "OPEN" },
                });
                if (open) return open;
                const window = await meterWindow(tx, org, now);
                return tx.aiRequest.create({
                    data: {
                        organizationId: org,
                        userId: ctx.userId,
                        windowKey: window.key,
                        createdAt: now,
                    },
                });
            }),
        );
        return {
            id: row.id,
            status: row.status,
            createdAt: row.createdAt.toISOString(),
        };
    }

    /**
     * Saroh grants an open request: `packs` of the plan's `ask-ai` add-on
     * for the business, for this period only (owner, 13 Nov 2026): their
     * removal is queued for just before the period ends (`ai.grant.end`).
     * Staff only; the console's guard checks who (U8). Claimed first, so a
     * second grant of the same request adds nothing; put back to open, and
     * anything added taken off again, when it can't be done whole.
     */
    async grant(
        requestId: string,
        staffUserId: string,
        packs: number,
        reason: string,
        now: Date = new Date(),
    ): Promise<void> {
        if (!Number.isInteger(packs) || packs < 1) {
            throw new BadRequestException("Grant at least one pack.");
        }
        const request = await this.claim(requestId, {
            status: "GRANTED",
            decidedByUserId: staffUserId,
            decidedAt: now,
            reason,
            packs,
        });
        let added: string | null = null;
        try {
            ({ addonId: added } = await this.addons.addBySaroh(
                request.organizationId,
                ASK_AI_MODULE,
                packs,
                staffUserId,
                now,
            ));
            const addonId = added;
            const window = await outsideOrgContext(() =>
                meterWindow(prisma, request.organizationId, now),
            );
            await outsideOrgContext(() =>
                prisma.$transaction((tx) =>
                    scheduleGrantEnd(tx, {
                        requestId,
                        addonId,
                        organizationId: request.organizationId,
                        periodEnd: window.end,
                    }),
                ),
            );
        } catch (error) {
            if (added) {
                await this.addons.removeBySaroh(
                    request.organizationId,
                    added,
                    packs,
                    staffUserId,
                    now,
                );
            }
            await outsideOrgContext(() =>
                prisma.aiRequest.update({
                    where: { id: requestId },
                    data: {
                        status: "OPEN",
                        decidedByUserId: null,
                        decidedAt: null,
                        reason: null,
                        packs: null,
                        packsEndAt: null,
                    },
                }),
            );
            throw error;
        }
    }

    /** Saroh declines an open request, with a reason. */
    async decline(
        requestId: string,
        staffUserId: string,
        reason: string,
        now: Date = new Date(),
    ): Promise<void> {
        await this.claim(requestId, {
            status: "DECLINED",
            decidedByUserId: staffUserId,
            decidedAt: now,
            reason,
        });
    }

    /** Moves an open request on, once; a decided or unknown one is refused. */
    private async claim(
        requestId: string,
        data: {
            status: "GRANTED" | "DECLINED";
            decidedByUserId: string;
            decidedAt: Date;
            reason: string;
            packs?: number;
        },
    ): Promise<{ organizationId: string }> {
        if (!data.reason.trim()) throw new BadRequestException("Say why.");
        // CROSS-TENANT: the console's, behind its own guard.
        return outsideOrgContext(async () => {
            const { count } = await prisma.aiRequest.updateMany({
                where: { id: requestId, status: "OPEN" },
                data: { ...data, reason: data.reason.trim() },
            });
            const row = await prisma.aiRequest.findUnique({
                where: { id: requestId },
                select: { organizationId: true },
            });
            if (!row) throw new NotFoundException("No such request.");
            if (count === 0) {
                throw new ConflictException("That request is already decided.");
            }
            return row;
        });
    }
}
