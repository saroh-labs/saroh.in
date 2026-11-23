import { Injectable, Logger, Optional } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { MediaService } from "../../media/media.service";
import { heldOrganizationIds } from "../../organizations/legal-hold";
import { openMessageBody } from "./sealing";

/** The daily job that forgets Ask AI conversations past their 90 days. */
export const AI_RETENTION_TYPE = "ai.retention";

export const AI_RETENTION_EVERY_MS = 24 * 60 * 60 * 1000;

/** An Ask AI image picked and never sent is kept this long. */
export const UNSENT_IMAGE_MS = 24 * 60 * 60 * 1000;

/** A conversation is kept this long after its last message (DEC-220). */
export const AI_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const CHAIN_LOCK = `job-chain:${AI_RETENTION_TYPE}`;
const BATCH = 500;

/**
 * Ask AI's history retention (DEC-220), daily: a conversation whose last
 * message is more than 90 days old is deleted with its messages (the
 * foreign key cascades). Its usage rows stay, numbers only, and lose their
 * link to it (`SET NULL`), so counts and cost outlive the text. A business
 * on legal hold keeps everything (DEC-122). Running it twice deletes
 * nothing more.
 *
 * The images a question carried (media purpose `ask-ai-sent`, never
 * applied) are deleted with their conversation, files and rows; one picked
 * and never sent goes after a day.
 *
 * Its drafts (U5, `AskAiDraft`) go with it: the foreign key cascades.
 * Reports about an answer (U8, `AiReport`) keep their own copy and are
 * deleted here 90 days after they were made, whatever their conversation.
 *
 * It reschedules itself (ADR-007), one waiting run at a time under the
 * advisory lock `job-chain:ai.retention`; the payload is empty. It throws
 * only when the next run cannot be enqueued.
 */
@Injectable()
export class AiRetentionJob {
    private readonly logger = new Logger(AiRetentionJob.name);

    /** Rows read at a time; tests make it small. */
    batch = BATCH;

    constructor(@Optional() private readonly media?: MediaService) {}

    readonly handle = async (_job: Job): Promise<void> => {
        const now = new Date();
        try {
            const deleted = await this.sweep(now);
            if (deleted > 0) {
                this.logger.log(`ai_retention deleted=${deleted}`);
            }
        } catch (error) {
            this.logger.error(
                `ai_retention failed before it finished: ${errorName(error)}`,
            );
        }
        const next = new Date(now.getTime() + AI_RETENTION_EVERY_MS);
        if (!(await this.schedule(next))) {
            throw new Error(
                "Could not schedule the next Ask AI retention run; retrying this one",
            );
        }
    };

    /** Deletes every conversation and report past its 90 days; returns how many. */
    async sweep(now: Date): Promise<number> {
        const before = new Date(now.getTime() - AI_RETENTION_MS);
        // Read once a run: there are few, and a hold placed mid-run is
        // honoured from the next batch's read of the same list.
        const held = await heldOrganizationIds(prisma);
        const notHeld =
            held.length > 0 ? { organizationId: { notIn: held } } : {};
        let deleted = 0;
        let after: string | undefined;
        for (;;) {
            const due = await prisma.aiConversation.findMany({
                where: {
                    lastMessageAt: { lt: before },
                    ...notHeld,
                    ...(after ? { id: { gt: after } } : {}),
                },
                orderBy: { id: "asc" },
                select: { id: true },
                take: this.batch,
            });
            if (due.length === 0) break;
            after = due[due.length - 1].id;
            // The images its questions carried go with it (read first: the
            // messages go with the conversation).
            const carried = await this.imagesOf(due.map((c) => c.id));
            // The date again in the delete: a message added since the read
            // keeps its conversation.
            const done = await prisma.aiConversation.deleteMany({
                where: {
                    id: { in: due.map((c) => c.id) },
                    lastMessageAt: { lt: before },
                    ...notHeld,
                },
            });
            if (done.count > 0) {
                const kept = new Set(
                    (
                        await prisma.aiConversation.findMany({
                            where: { id: { in: due.map((c) => c.id) } },
                            select: { id: true },
                        })
                    ).map((c) => c.id),
                );
                deleted +=
                    (await this.media?.deleteAskAiImages(
                        carried.flatMap((c) =>
                            kept.has(c.id) ? [] : c.images,
                        ),
                    )) ?? 0;
            }
            deleted += done.count;
            if (due.length < this.batch) break;
        }
        // Reports: a few a day at most, so one delete.
        const reports = await prisma.aiReport.deleteMany({
            where: { createdAt: { lt: before }, ...notHeld },
        });
        // The images people sent with a question go with the conversation's days.
        const unsent = new Date(now.getTime() - UNSENT_IMAGE_MS);
        const images =
            (await this.media?.deleteUnsentAskAiImagesBefore(unsent, held)) ??
            0;
        return deleted + reports.count + images;
    }

    /** The media ids each conversation's questions carried (sealed in their messages). */
    private async imagesOf(
        ids: string[],
    ): Promise<{ id: string; images: string[] }[]> {
        const rows = await prisma.aiMessage.findMany({
            where: { conversationId: { in: ids }, role: "USER" },
            select: {
                id: true,
                organizationId: true,
                conversationId: true,
                bodyCiphertext: true,
                bodyIv: true,
                bodyAuthTag: true,
            },
        });
        const by = new Map<string, string[]>();
        for (const m of rows) {
            try {
                const body = openMessageBody(
                    {
                        ciphertext: m.bodyCiphertext,
                        iv: m.bodyIv,
                        authTag: m.bodyAuthTag,
                    },
                    {
                        organizationId: m.organizationId,
                        conversationId: m.conversationId,
                        rowId: m.id,
                    },
                );
                if (body.images?.length) {
                    by.set(m.conversationId, [
                        ...(by.get(m.conversationId) ?? []),
                        ...body.images,
                    ]);
                }
            } catch {
                // A message that can't be opened has no images to find.
            }
        }
        return [...by].map(([id, images]) => ({ id, images }));
    }

    /** Leave one run waiting at `runAt`, unless one is. Never throws. */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CHAIN_LOCK}))`;
                const waiting = await tx.job.count({
                    where: { type: AI_RETENTION_TYPE, status: "PENDING" },
                });
                if (waiting > 0) return;
                await tx.job.create({
                    data: { type: AI_RETENTION_TYPE, payload: {}, runAt },
                });
            });
            return true;
        } catch (error) {
            this.logger.error(
                `Could not schedule the next Ask AI retention run: ${errorName(error)}`,
            );
            return false;
        }
    }

    /** Restart the chain when nothing is waiting or running. Never throws. */
    async ensureScheduled(now: Date = new Date()): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: AI_RETENTION_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live === 0) await this.schedule(now);
        } catch (error) {
            this.logger.error(
                `Could not check the Ask AI retention chain: ${errorName(error)}`,
            );
        }
    }
}

function errorName(error: unknown): string {
    return error instanceof Error ? error.name : "unknown error";
}
