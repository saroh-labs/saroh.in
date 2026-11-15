import { Injectable, Logger } from "@nestjs/common";
import type { AiTurnOutcome, Job } from "@saroh/database";
import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import {
    AiSettingNotConfiguredError,
    AiSettingsService,
} from "../settings/ai-settings.service";
import { AlarmChain, claimAlert } from "./alarm-chain";
import { OwnerAlertSender } from "./owner-alert";

/** Ask AI's failure watch (DEC-220, plan 2026-11-13-001 U8). */
export const AI_FAILURE_ALARM_TYPE = "ai.failure-alarm";

export const AI_FAILURE_ALARM_EVERY_MS = 10 * 60_000;

const HOUR_MS = 60 * 60_000;

/** Turns that ran (a refusal at the start never reached the provider). */
const RAN: AiTurnOutcome[] = [
    "ANSWERED",
    "DRAFT",
    "STOPPED_BEFORE",
    "STOPPED_AFTER",
    "FAILED",
    "CUT_OFF",
];
const FAILED: ReadonlySet<AiTurnOutcome> = new Set(["FAILED", "CUT_OFF"]);

/** Whether the failed share is above the setting, once enough turns ran. */
export function failuresAlarming(
    finished: number,
    failed: number,
    ratio: number,
    minTurns: number,
): boolean {
    return finished >= minTurns && finished > 0 && failed / finished > ratio;
}

/** Turns that finished since `since`, and how many of them failed or were cut off. */
export async function failureCounts(
    since: Date,
): Promise<{ finished: number; failed: number }> {
    const rows = await prisma.aiUsage.groupBy({
        by: ["outcome"],
        where: { finishedAt: { gte: since }, outcome: { in: RAN } },
        _count: { _all: true },
    });
    let finished = 0;
    let failed = 0;
    for (const r of rows) {
        finished += r._count._all;
        if (FAILED.has(r.outcome)) failed += r._count._all;
    }
    return { finished, failed };
}

/**
 * Every 10 minutes: the share of the last hour's finished turns that
 * failed or were cut off. Above `ai.failureAlarmRatio`, with at least
 * `ai.failureAlarmMinTurns` finished, Platform owners are emailed, once a
 * UTC hour. Numbers only. Unset settings: logged and skipped.
 */
@Injectable()
export class FailureAlarmJob {
    private readonly logger = new Logger(FailureAlarmJob.name);
    readonly chain = new AlarmChain(
        AI_FAILURE_ALARM_TYPE,
        this.logger,
        (tx, runAt) =>
            tx.job.create({
                data: { type: AI_FAILURE_ALARM_TYPE, payload: {}, runAt },
            }),
    );

    constructor(
        private readonly settings: AiSettingsService,
        private readonly alerts: OwnerAlertSender,
    ) {}

    readonly handle = async (_job: Job): Promise<void> => {
        await this.chain.run(() => this.check(), AI_FAILURE_ALARM_EVERY_MS);
    };

    /** One look; true when it emailed. */
    async check(now: Date = new Date()): Promise<boolean> {
        let ratio: number;
        let minTurns: number;
        try {
            [ratio, minTurns] = await Promise.all([
                this.settings.get("ai.failureAlarmRatio"),
                this.settings.get("ai.failureAlarmMinTurns"),
            ]);
        } catch (error) {
            if (!(error instanceof AiSettingNotConfiguredError)) throw error;
            this.logger.warn(`ai_failure_alarm not configured: ${error.key}`);
            return false;
        }
        const { finished, failed } = await failureCounts(
            new Date(now.getTime() - HOUR_MS),
        );
        if (!failuresAlarming(finished, failed, ratio, minTurns)) return false;
        const hour = DateTime.fromJSDate(now, { zone: "utc" }).toFormat(
            "yyyy-MM-dd'T'HH",
        );
        if (!(await claimAlert(prisma, "failures", hour))) return false;
        this.logger.warn(
            `ai_failure_alarm finished=${finished} failed=${failed}`,
        );
        await this.alerts.send(
            {
                subject: "Ask AI: many questions failed in the last hour",
                lines: [
                    "More of the last hour's Ask AI questions failed or were cut off than the alarm allows.",
                    "",
                    `Finished in the last hour: ${finished}`,
                    `Failed or cut off: ${failed} (${Math.round((failed / finished) * 100)}%)`,
                ],
            },
            now,
        );
        return true;
    }
}
