import { Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { outsideOrgContext, prisma } from "@saroh/database";

import { AddonsService } from "../../billing/addons.service";

/**
 * The end of a granted Request more (owner, 13 Nov 2026: more questions
 * for this period only). A grant adds `ask-ai` packs through the normal
 * add-on path, which would keep them, and bill them, every period after;
 * this job takes them off again through the same path at the period's end.
 */
export const AI_GRANT_END_TYPE = "ai.grant.end";

/**
 * How long before the period's end the packs come off. At the end itself
 * the add-on path refuses (the period is over until the renewal arrives),
 * and once the renewal arrives the next period has been charged for what
 * was held, so they come off just before it.
 */
export const GRANT_END_LEAD_MS = 5 * 60_000;

export interface AiGrantEndPayload {
    requestId: string;
    addonId: string;
}

/** Queue the packs' removal; written with the grant's `packsEndAt`. */
export async function scheduleGrantEnd(
    tx: Pick<Prisma.TransactionClient, "job" | "aiRequest">,
    input: AiGrantEndPayload & { organizationId: string; periodEnd: Date },
): Promise<void> {
    const runAt = new Date(input.periodEnd.getTime() - GRANT_END_LEAD_MS);
    await tx.aiRequest.update({
        where: { id: input.requestId },
        data: { packsEndAt: runAt },
    });
    await tx.job.create({
        data: {
            type: AI_GRANT_END_TYPE,
            organizationId: input.organizationId,
            payload: {
                requestId: input.requestId,
                addonId: input.addonId,
            } satisfies AiGrantEndPayload,
            runAt,
        },
    });
}

/**
 * Takes a granted request's packs off, once: the request is claimed
 * (`packsRemovedAt`) before the add-on changes, and put back when the
 * change fails, so a retry tries again and a second run removes nothing.
 * A request no longer granted (put back to open when its add-on failed)
 * has nothing to take off.
 */
@Injectable()
export class AiGrantEndJob {
    private readonly logger = new Logger(AiGrantEndJob.name);

    constructor(private readonly addons: AddonsService) {}

    readonly handle = async (job: Job): Promise<void> => {
        const { requestId, addonId } =
            job.payload as unknown as AiGrantEndPayload;
        await this.end(requestId, addonId);
    };

    async end(
        requestId: string,
        addonId: string,
        now: Date = new Date(),
    ): Promise<boolean> {
        // CROSS-TENANT: a job, not a request; the row names its business.
        return outsideOrgContext(async () => {
            const { count } = await prisma.aiRequest.updateMany({
                where: {
                    id: requestId,
                    status: "GRANTED",
                    packsRemovedAt: null,
                },
                data: { packsRemovedAt: now },
            });
            if (count === 0) return false;
            const row = await prisma.aiRequest.findUniqueOrThrow({
                where: { id: requestId },
                select: {
                    organizationId: true,
                    packs: true,
                    decidedByUserId: true,
                },
            });
            try {
                await this.addons.removeBySaroh(
                    row.organizationId,
                    addonId,
                    row.packs ?? 1,
                    row.decidedByUserId ?? "system:ai-grant-end",
                    now,
                );
            } catch (error) {
                await prisma.aiRequest.update({
                    where: { id: requestId },
                    data: { packsRemovedAt: null },
                });
                this.logger.warn(
                    `ai_grant_end failed request=${requestId}: ${error instanceof Error ? error.name : "unknown"}`,
                );
                throw error;
            }
            this.logger.log(`ai_grant_end removed request=${requestId}`);
            return true;
        });
    }
}
