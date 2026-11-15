import { Injectable } from "@nestjs/common";
import type { AiRequestStatus, Prisma } from "@saroh/database";
import { outsideOrgContext, prisma } from "@saroh/database";
import type { Edition } from "@saroh/edition";
import { DateTime } from "luxon";

import { viaBusiness } from "../../admin/admin-edition";
import { AiRequestsService } from "../requests/ai-requests.service";
import { AI_SETTING_KEYS } from "../settings/ai-setting-keys";
import type {
    AiSettingActor,
    AiSettingRecord,
} from "../settings/ai-settings.service";
import { AiSettingsService } from "../settings/ai-settings.service";
import { failureCounts } from "./failure-alarm.job";
import { spendMonth, spentSince } from "./spend-alarm.job";

/** Writes the ledger row inside the change's own transaction. */
export type AuditIn = (tx: Prisma.TransactionClient) => Promise<void>;

/** A setting as the console lists it: the row in effect, or none yet. */
export interface AiSettingNow {
    key: string;
    current: AiSettingRecord | null;
}

export interface AiRequestRow {
    id: string;
    organizationId: string;
    businessName: string;
    userId: string;
    windowKey: string;
    status: AiRequestStatus;
    reason: string | null;
    packs: number | null;
    packsEndAt: string | null;
    packsRemovedAt: string | null;
    createdAt: string;
    decidedAt: string | null;
}

/** Today's and this month's numbers, UTC. Never text. */
export interface AiOpsSummary {
    halted: boolean;
    haltReason: string | null;
    spentTodayMicroUsd: number;
    spentThisMonthMicroUsd: number;
    lastHour: { finished: number; failed: number };
    today: { finished: number; failed: number };
    openRequests: number;
    openReports: number;
}

/** A bound on one console page, not a plan limit. */
const REQUESTS_PAGE = 50;

/**
 * The console's Ask AI page (DEC-220, plan 2026-11-13-001 U8), behind the
 * admin routes' guards: the settings and their history, the halt, one
 * business's override, Request more, and today's numbers. Every write runs
 * with its ledger row in one transaction where it can; the controller
 * says what the row says.
 */
@Injectable()
export class AiOpsAdminService {
    constructor(
        private readonly settings: AiSettingsService,
        private readonly requests: AiRequestsService,
    ) {}

    async listSettings(now: Date = new Date()): Promise<AiSettingNow[]> {
        const rows = await prisma.aiSetting.findMany({
            where: { effectiveFrom: { lte: now } },
            orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
            distinct: ["key"],
        });
        const byKey = new Map(rows.map((r) => [r.key, r]));
        return AI_SETTING_KEYS.map((key) => ({
            key,
            current: byKey.get(key) ?? null,
        }));
    }

    history(key: string): Promise<AiSettingRecord[]> {
        return this.settings.history(key);
    }

    async set(
        key: string,
        value: unknown,
        reason: string,
        actor: AiSettingActor,
        audit: AuditIn,
    ): Promise<AiSettingRecord> {
        return prisma.$transaction(async (tx) => {
            const row = await this.settings.set(
                key,
                value,
                reason,
                actor,
                new Date(),
                tx,
            );
            await audit(tx);
            return row;
        });
    }

    async setOverride(
        organizationId: string,
        key: string,
        value: unknown,
        reason: string,
        actor: AiSettingActor,
        expiresAt: Date | undefined,
        audit: AuditIn,
    ): Promise<void> {
        await outsideOrgContext(() =>
            prisma.$transaction(async (tx) => {
                await this.settings.setOverride(
                    organizationId,
                    key,
                    value,
                    reason,
                    actor,
                    { expiresAt },
                    tx,
                );
                await audit(tx);
            }),
        );
    }

    async endOverride(
        organizationId: string,
        key: string,
        reason: string,
        actor: AiSettingActor,
        audit: AuditIn,
    ): Promise<void> {
        await outsideOrgContext(() =>
            prisma.$transaction(async (tx) => {
                await this.settings.endOverride(
                    organizationId,
                    key,
                    reason,
                    actor,
                    tx,
                );
                await audit(tx);
            }),
        );
    }

    listRequests(
        edition: Edition | null,
        status?: AiRequestStatus,
    ): Promise<AiRequestRow[]> {
        // CROSS-TENANT: the console's.
        return outsideOrgContext(async () => {
            const rows = await prisma.aiRequest.findMany({
                where: {
                    ...(status ? { status } : {}),
                    ...viaBusiness(edition),
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: REQUESTS_PAGE,
                include: { organization: { select: { name: true } } },
            });
            return rows.map((r) => ({
                id: r.id,
                organizationId: r.organizationId,
                businessName: r.organization.name,
                userId: r.userId,
                windowKey: r.windowKey,
                status: r.status,
                reason: r.reason,
                packs: r.packs,
                packsEndAt: r.packsEndAt?.toISOString() ?? null,
                packsRemovedAt: r.packsRemovedAt?.toISOString() ?? null,
                createdAt: r.createdAt.toISOString(),
                decidedAt: r.decidedAt?.toISOString() ?? null,
            }));
        });
    }

    /** One pack, this period only (owner, 13 Nov 2026). */
    grant(requestId: string, staffUserId: string, reason: string) {
        return this.requests.grant(requestId, staffUserId, 1, reason);
    }

    decline(requestId: string, staffUserId: string, reason: string) {
        return this.requests.decline(requestId, staffUserId, reason);
    }

    /** The business a request is from, for the ledger; null when there's none. */
    async requestBusiness(requestId: string): Promise<string | null> {
        const row = await outsideOrgContext(() =>
            prisma.aiRequest.findUnique({
                where: { id: requestId },
                select: { organizationId: true },
            }),
        );
        return row?.organizationId ?? null;
    }

    async summary(now: Date = new Date()): Promise<AiOpsSummary> {
        const day = DateTime.fromJSDate(now, { zone: "utc" })
            .startOf("day")
            .toJSDate();
        const [halt, today, month, lastHour, todayCounts, open] =
            await Promise.all([
                this.settings.halt(now),
                spentSince(day),
                spentSince(spendMonth(now).start),
                failureCounts(new Date(now.getTime() - 60 * 60_000)),
                failureCounts(day),
                outsideOrgContext(() =>
                    Promise.all([
                        prisma.aiRequest.count({ where: { status: "OPEN" } }),
                        prisma.aiReport.count({ where: { status: "OPEN" } }),
                    ]),
                ),
            ]);
        return {
            halted: halt.halted,
            haltReason: halt.reason ?? null,
            spentTodayMicroUsd: today,
            spentThisMonthMicroUsd: month,
            lastHour,
            today: todayCounts,
            openRequests: open[0],
            openReports: open[1],
        };
    }
}
