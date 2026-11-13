import { Injectable } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { outsideOrgContext, prisma, runInOrgContext } from "@saroh/database";
import type { ModuleAccess } from "@saroh/pricing-catalog";
import { DateTime } from "luxon";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { CatalogueAccessService } from "../../billing/catalogue-access.service";
import { FeatureFlagService } from "../../feature-flags/feature-flags.service";
import { allows } from "../../organizations/organization-policy";
import { AiSettingsService } from "../settings/ai-settings.service";
import { TurnStore } from "../turn/turn-store";
import type { AskAiRefusal, TurnAdmit } from "./refusal";

export type { AskAiRefusal, TurnAdmit } from "./refusal";

/** Ask AI's row in the plans catalogue (`MODULE_MAP`), and its add-on kind. */
export const ASK_AI_MODULE = "ask-ai";

/** Turns one person may run at once. */
const RUNNING_PER_PERSON = 1;

/** The lock every turn start takes while it checks and reserves (`backend-jobs.md`, advisory locks). */
const START_LOCK = "ask-ai-turn-start";

/** The caps a turn start holds to, read from the AI settings. */
export interface StartLimits {
    turnCostCapMicroUsd: number;
    businessDayCostCapMicroUsd: number;
    sarohDayCostCapMicroUsd: number;
    runningTurnsPerBusiness: number;
    questionsPerMinutePerPerson: number;
}

export type AskAiEntry =
    { ok: true; row: ModuleAccess } | { ok: false; refusal: AskAiRefusal };

/** Recorded cost plus a turn's maximum for each one still running: what a day has spent or holds. */
async function dayHeld(
    db: Pick<Prisma.TransactionClient, "aiUsage">,
    where: Prisma.AiUsageWhereInput,
    turnCap: number,
): Promise<number> {
    const [sum, running] = await Promise.all([
        db.aiUsage.aggregate({ where, _sum: { costMicroUsd: true } }),
        db.aiUsage.count({ where: { ...where, outcome: "RUNNING" } }),
    ]);
    return (sum._sum.costMicroUsd ?? 0) + running * turnCap;
}

/**
 * Who may ask Ask AI, and how much (DEC-220, plan 2026-11-13-001 U7).
 *
 * {@link entry} answers "may this person use Ask AI here at all": the
 * Saroh-wide halt, the `ASK_AI` rollout, the plan (Ask AI's catalogue row,
 * which fails closed: a business off the catalogue, or on a version without
 * the row, is locked, since every question costs Saroh), `ai:use`, and the
 * business's own switch. A turn asks it first; a draft's Confirm, Undo and
 * Draft again ask it too.
 *
 * {@link admit} is the turn start's part, run on the start's transaction
 * under one advisory lock so two starts can't both take the last room:
 * the allowance (questions that counted, plus turns still running, in the
 * billing period), the business's and Saroh's day (recorded cost of every
 * usage row, counted or not, plus a turn's maximum held for each running
 * one: the RUNNING row is the reservation, settled when the turn writes
 * its cost), one running turn a person and a few a business, and a
 * per-person rate a minute.
 */
@Injectable()
export class AskAiAccess {
    constructor(
        private readonly settings: AiSettingsService,
        private readonly flags: FeatureFlagService,
        private readonly store: TurnStore,
        private readonly catalogue: CatalogueAccessService,
    ) {}

    async entry(
        ctx: OrganizationContext,
        now: Date = new Date(),
    ): Promise<AskAiEntry> {
        const org = ctx.organizationId;
        const no = (refusal: AskAiRefusal): AskAiEntry => ({
            ok: false,
            refusal,
        });
        if ((await this.settings.halt(now)).halted) {
            return no({ reason: "unavailable" });
        }
        if (!(await this.flags.isEnabled("ASK_AI", org))) {
            return no({ reason: "unavailable" });
        }
        const row = await this.planRow(org, now);
        if (row?.state !== "on") {
            return no({
                reason: "locked",
                upgradeTo: row?.upgradeTo ?? "",
            });
        }
        if (!allows(ctx, "ai:use")) return no({ reason: "no-permission" });
        if (!(await this.store.businessOn(org))) {
            return no({
                reason: "business-off",
                askName: await this.ownerName(org),
            });
        }
        return { ok: true, row };
    }

    /** The caps {@link admit} holds to; a missing one throws `AiSettingNotConfiguredError`. */
    async limits(organizationId: string): Promise<StartLimits> {
        const get = this.settings.get.bind(this.settings);
        const [
            turnCostCapMicroUsd,
            businessDayCostCapMicroUsd,
            sarohDayCostCapMicroUsd,
            runningTurnsPerBusiness,
            questionsPerMinutePerPerson,
        ] = await Promise.all([
            get("askAi.turnCostCapMicroUsd", organizationId),
            get("askAi.businessDayCostCapMicroUsd", organizationId),
            get("ai.sarohDayCostCapMicroUsd"),
            get("askAi.runningTurnsPerBusiness", organizationId),
            get("askAi.questionsPerMinutePerPerson", organizationId),
        ]);
        return {
            turnCostCapMicroUsd,
            businessDayCostCapMicroUsd,
            sarohDayCostCapMicroUsd,
            runningTurnsPerBusiness,
            questionsPerMinutePerPerson,
        };
    }

    /** The start's checks, for `TurnStore.start` to run before it writes the RUNNING row. */
    admit(
        ctx: OrganizationContext,
        row: ModuleAccess,
        limits: StartLimits,
        now: Date,
    ): TurnAdmit {
        const org = ctx.organizationId;
        const me = { organizationId: org, userId: ctx.userId };
        return async (tx, window) => {
            // shortcut: one lock for every business, so Saroh's day can't be
            // over-reserved; starts are short. Per-business locks plus a
            // looser Saroh check if starts ever queue on it.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${START_LOCK}))`;

            if (row.limit !== null) {
                const used = await tx.aiUsage.count({
                    where: {
                        organizationId: org,
                        startedAt: { gte: window.start },
                        OR: [{ counted: true }, { outcome: "RUNNING" }],
                    },
                });
                if (used >= row.limit) {
                    const requestMore = allows(ctx, "billing:read");
                    return {
                        reason: "allowance",
                        limit: row.limit,
                        resetsAt: window.end,
                        requestMore,
                        askName: requestMore ? null : await this.ownerName(org),
                    };
                }
            }

            const cap = limits.turnCostCapMicroUsd;
            const businessDay = DateTime.fromJSDate(now, { zone: window.zone })
                .startOf("day")
                .toJSDate();
            const business = await dayHeld(
                tx,
                { organizationId: org, startedAt: { gte: businessDay } },
                cap,
            );
            if (business + cap > limits.businessDayCostCapMicroUsd) {
                return { reason: "daily-limit", scope: "business" };
            }
            // Every business's rows: read outside this one's row security.
            // The lock above holds every other start back meanwhile.
            const sarohDay = DateTime.fromJSDate(now, { zone: "utc" })
                .startOf("day")
                .toJSDate();
            const saroh = await outsideOrgContext(() =>
                dayHeld(prisma, { startedAt: { gte: sarohDay } }, cap),
            );
            if (saroh + cap > limits.sarohDayCostCapMicroUsd) {
                return { reason: "daily-limit", scope: "saroh" };
            }

            const [mine, theirs, lastMinute] = await Promise.all([
                tx.aiUsage.count({ where: { ...me, outcome: "RUNNING" } }),
                tx.aiUsage.count({
                    where: { organizationId: org, outcome: "RUNNING" },
                }),
                tx.aiUsage.count({
                    where: {
                        ...me,
                        startedAt: { gte: new Date(now.getTime() - 60_000) },
                    },
                }),
            ]);
            if (mine >= RUNNING_PER_PERSON) {
                return { reason: "busy", who: "you" };
            }
            if (theirs >= limits.runningTurnsPerBusiness) {
                return { reason: "busy", who: "business" };
            }
            if (lastMinute >= limits.questionsPerMinutePerPerson) {
                return { reason: "rate-limit" };
            }
            return null;
        };
    }

    /** Ask AI's catalogue row for the business, or null when the catalogue doesn't reach it. */
    private async planRow(
        organizationId: string,
        now: Date,
    ): Promise<ModuleAccess | null> {
        const a = await this.catalogue.resolve(organizationId, now);
        if (a.source !== "catalogue") return null;
        return a.modules.find((m) => m.moduleId === ASK_AI_MODULE) ?? null;
    }

    /** The owner's name, for "ask …". */
    private async ownerName(organizationId: string): Promise<string | null> {
        const owner = await outsideOrgContext(() =>
            runInOrgContext(organizationId, () =>
                prisma.membership.findFirst({
                    where: { organizationId, role: "OWNER" },
                    orderBy: { createdAt: "asc" },
                    select: { user: { select: { name: true } } },
                }),
            ),
        );
        return owner?.user.name ?? null;
    }
}
