import { Injectable, Logger } from "@nestjs/common";
import { MCP_IDLE_SECONDS } from "@saroh/auth";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import {
    AI_CONNECTIONS_ACTOR,
    AiConnectionsService,
    endConnection,
} from "./ai-connections.service";

/** The daily job that ends idle AI connections and forgets unused apps. */
export const AI_CONNECTIONS_SWEEP_TYPE = "mcp.ai-connections-sweep";

export const AI_CONNECTIONS_SWEEP_EVERY_MS = 24 * 60 * 60 * 1000;

/** A registered app nobody connected within this long is forgotten. */
export const UNUSED_CLIENT_MS = 7 * 24 * 60 * 60 * 1000;

const CHAIN_LOCK = `job-chain:${AI_CONNECTIONS_SWEEP_TYPE}`;
const BATCH = 500;

/**
 * AI connections' housekeeping (U9), daily:
 * - a connection unused for 90 days ends, as a disconnect does (its grant
 *   goes and its refresh tokens are revoked), and the business's activity
 *   says so. `McpAuthGuard` already refuses it from day 90; this tidies;
 * - an app registered (dynamically or by CIMD) more than a week ago that
 *   holds no connection and no refresh token is deleted, so open
 *   registration can't pile up clients.
 *
 * It reschedules itself (ADR-007), one waiting run at a time under the
 * advisory lock `job-chain:mcp.ai-connections-sweep`, as the inactivity
 * sweep does; it throws only when the next run cannot be enqueued.
 */
@Injectable()
export class AiConnectionsSweepJob {
    private readonly logger = new Logger(AiConnectionsSweepJob.name);

    constructor(private readonly connections: AiConnectionsService) {}

    readonly handle = async (_job: Job): Promise<void> => {
        const now = new Date();
        try {
            const r = await this.sweep(now);
            if (r.ended + r.forgotten > 0) {
                this.logger.log(
                    `ai_connections_sweep ended=${r.ended} forgotten=${r.forgotten}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `ai_connections_sweep failed before it finished: ${errorName(error)}`,
            );
        }
        const next = new Date(now.getTime() + AI_CONNECTIONS_SWEEP_EVERY_MS);
        if (!(await this.schedule(next))) {
            throw new Error(
                "Could not schedule the next AI connections sweep; retrying this one",
            );
        }
    };

    async sweep(now: Date): Promise<{ ended: number; forgotten: number }> {
        const idleBefore = new Date(now.getTime() - MCP_IDLE_SECONDS * 1000);
        const idle = await prisma.oauthConsent.findMany({
            where: {
                OR: [
                    { lastUsedAt: { lte: idleBefore } },
                    { lastUsedAt: null, createdAt: { lte: idleBefore } },
                ],
            },
            take: BATCH,
        });
        for (const grant of idle) {
            await endConnection(grant);
            await this.connections
                .recordEnded(grant, AI_CONNECTIONS_ACTOR, "idle")
                .catch((error: unknown) =>
                    this.logger.warn(
                        `ai_connections_sweep could not record an idle end: ${errorName(error)}`,
                    ),
                );
        }

        const old = await prisma.oauthClient.findMany({
            where: {
                createdAt: { lte: new Date(now.getTime() - UNUSED_CLIENT_MS) },
            },
            select: { clientId: true },
            take: BATCH,
        });
        const ids = old.map((c) => c.clientId);
        const [granted, refreshing] = await Promise.all([
            prisma.oauthConsent.findMany({
                where: { clientId: { in: ids } },
                select: { clientId: true },
                distinct: ["clientId"],
            }),
            prisma.oauthRefreshToken.findMany({
                where: {
                    clientId: { in: ids },
                    revoked: null,
                    expiresAt: { gt: now },
                },
                select: { clientId: true },
                distinct: ["clientId"],
            }),
        ]);
        const inUse = new Set(
            [...granted, ...refreshing].map((r) => r.clientId),
        );
        const unused = ids.filter((id) => !inUse.has(id));
        if (unused.length > 0) {
            await prisma.$transaction([
                prisma.oauthClientResource.deleteMany({
                    where: { clientId: { in: unused } },
                }),
                prisma.oauthClient.deleteMany({
                    where: { clientId: { in: unused } },
                }),
            ]);
        }
        return { ended: idle.length, forgotten: unused.length };
    }

    /** Leave one run waiting at `runAt`, unless one is. Never throws. */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CHAIN_LOCK}))`;
                const waiting = await tx.job.count({
                    where: {
                        type: AI_CONNECTIONS_SWEEP_TYPE,
                        status: "PENDING",
                    },
                });
                if (waiting > 0) return;
                await tx.job.create({
                    data: {
                        type: AI_CONNECTIONS_SWEEP_TYPE,
                        payload: {},
                        runAt,
                    },
                });
            });
            return true;
        } catch (error) {
            this.logger.error(
                `Could not schedule the next AI connections sweep: ${errorName(error)}`,
            );
            return false;
        }
    }

    /** Restart the chain when nothing is waiting or running. Never throws. */
    async ensureScheduled(now: Date = new Date()): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: AI_CONNECTIONS_SWEEP_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live === 0) await this.schedule(now);
        } catch (error) {
            this.logger.error(
                `Could not check the AI connections sweep chain: ${errorName(error)}`,
            );
        }
    }
}

function errorName(error: unknown): string {
    return error instanceof Error ? error.name : "unknown error";
}
