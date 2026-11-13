import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import {
    AiSettingNotConfiguredError,
    AiSettingsService,
} from "../settings/ai-settings.service";
import { AlarmChain, claimAlert } from "./alarm-chain";
import { OwnerAlertSender } from "./owner-alert";

/** Ask AI's spend alarm (DEC-220, plan 2026-11-13-001 U8). */
export const AI_SPEND_ALARM_TYPE = "ai.spend-alarm";

export const AI_SPEND_ALARM_EVERY_MS = 15 * 60_000;

/** Who sets the halt when the alarm does: no person, so a named system actor. */
export const SPEND_ALARM_ACTOR = "system:ai-spend-alarm";

export type SpendLevel = "under" | "warn" | "halt";

export interface SpendLimits {
    forecastMicroUsd: number;
    warnRatio: number;
    haltRatio: number;
}

/** Where this month's spend stands against the forecast. Nothing spent is under. */
export function spendLevel(spentMicroUsd: number, l: SpendLimits): SpendLevel {
    if (spentMicroUsd <= 0) return "under";
    if (spentMicroUsd >= l.forecastMicroUsd * l.haltRatio) return "halt";
    if (spentMicroUsd >= l.forecastMicroUsd * l.warnRatio) return "warn";
    return "under";
}

/** The UTC month `now` is in: its first instant and its key ("2026-11"). */
export function spendMonth(now: Date): { start: Date; key: string } {
    const start = DateTime.fromJSDate(now, { zone: "utc" }).startOf("month");
    return { start: start.toJSDate(), key: start.toFormat("yyyy-MM") };
}

/** What every turn since `since` recorded, counted or not, in micro-USD. */
export async function spentSince(since: Date): Promise<number> {
    const sum = await prisma.aiUsage.aggregate({
        where: { startedAt: { gte: since } },
        _sum: { costMicroUsd: true },
    });
    return sum._sum.costMicroUsd ?? 0;
}

const dollars = (microUsd: number) => `$${(microUsd / 1_000_000).toFixed(2)}`;

/**
 * Every 15 minutes: this UTC month's recorded AI cost (every usage row,
 * counted or not) against the forecast in the AI settings. Past the warn
 * share, Platform owners are emailed once a month; past the halt share,
 * Saroh's halt is set ("spend alarm") and they are emailed, once a month,
 * so a halt an owner lifts after looking stays lifted. Never touches the
 * `ASK_AI` flag. Unset settings: nothing to compare, logged and skipped.
 */
@Injectable()
export class SpendAlarmJob {
    private readonly logger = new Logger(SpendAlarmJob.name);
    readonly chain = new AlarmChain(
        AI_SPEND_ALARM_TYPE,
        this.logger,
        (tx, runAt) =>
            tx.job.create({
                data: { type: AI_SPEND_ALARM_TYPE, payload: {}, runAt },
            }),
    );

    constructor(
        private readonly settings: AiSettingsService,
        private readonly alerts: OwnerAlertSender,
    ) {}

    readonly handle = async (_job: Job): Promise<void> => {
        await this.chain.run(() => this.check(), AI_SPEND_ALARM_EVERY_MS);
    };

    /** One look; returns the level it found, or null without settings. */
    async check(now: Date = new Date()): Promise<SpendLevel | null> {
        let limits: SpendLimits;
        try {
            const [forecastMicroUsd, warnRatio, haltRatio] = await Promise.all([
                this.settings.get("ai.spendForecastMicroUsdPerMonth"),
                this.settings.get("ai.spendAlarmWarnRatio"),
                this.settings.get("ai.spendAlarmHaltRatio"),
            ]);
            limits = { forecastMicroUsd, warnRatio, haltRatio };
        } catch (error) {
            if (!(error instanceof AiSettingNotConfiguredError)) throw error;
            this.logger.warn(`ai_spend_alarm not configured: ${error.key}`);
            return null;
        }
        const month = spendMonth(now);
        const spent = await spentSince(month.start);
        const level = spendLevel(spent, limits);
        const share = limits.forecastMicroUsd
            ? Math.round((spent / limits.forecastMicroUsd) * 100)
            : null;
        const numbers = [
            `Spent this month (UTC): ${dollars(spent)}`,
            `Forecast: ${dollars(limits.forecastMicroUsd)}${share === null ? "" : ` (${share}% used)`}`,
        ];

        if (level === "halt") {
            const halted = await prisma.$transaction(async (tx) => {
                if (!(await claimAlert(tx, "spend-halt", month.key))) {
                    return false;
                }
                await this.settings.set(
                    "ai.halt",
                    true,
                    `spend alarm: ${month.key} spend reached the halt level`,
                    { userId: SPEND_ALARM_ACTOR },
                    now,
                    tx,
                );
                return true;
            });
            if (halted) {
                this.logger.warn(`ai_spend_alarm halted month=${month.key}`);
                await this.alerts.send(
                    {
                        subject:
                            "Ask AI is halted: this month's spend passed the halt level",
                        lines: [
                            "Saroh halted every agent because AI spend passed the halt level. Nobody can ask until the halt is lifted in the console.",
                            "",
                            ...numbers,
                        ],
                    },
                    now,
                );
            }
        } else if (level === "warn") {
            if (await claimAlert(prisma, "spend-warn", month.key)) {
                this.logger.warn(`ai_spend_alarm warned month=${month.key}`);
                await this.alerts.send(
                    {
                        subject:
                            "Ask AI: this month's spend passed the warning level",
                        lines: [
                            "AI spend passed the warning level. Nothing is halted yet.",
                            "",
                            ...numbers,
                        ],
                    },
                    now,
                );
            }
        }
        return level;
    }
}
