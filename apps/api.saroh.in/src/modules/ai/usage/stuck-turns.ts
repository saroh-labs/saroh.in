import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import {
    AiSettingNotConfiguredError,
    AiSettingsService,
} from "../settings/ai-settings.service";

/** How often the module looks for stuck turns. A cadence, not a limit. */
export const STUCK_TURN_CHECK_MS = 5 * 60 * 1000;

/**
 * Turns whose process died mid-turn (a deploy, a crash) leave their usage
 * row RUNNING. This marks the ones older than `askAi.stuckTurnMinutes`
 * FAILED and not counted, keeping whatever cost they recorded. One
 * conditional update across every business, so two replicas running it at
 * once fail each row once. Unset setting: nothing is swept.
 */
@Injectable()
export class StuckTurnSweep {
    private readonly logger = new Logger(StuckTurnSweep.name);

    constructor(private readonly settings: AiSettingsService) {}

    async sweep(now: Date = new Date()): Promise<number> {
        try {
            const minutes = await this.settings.get(
                "askAi.stuckTurnMinutes",
                undefined,
                now,
            );
            const { count } = await prisma.aiUsage.updateMany({
                where: {
                    outcome: "RUNNING",
                    startedAt: {
                        lt: new Date(now.getTime() - minutes * 60_000),
                    },
                },
                data: {
                    outcome: "FAILED",
                    counted: false,
                    failureReason: "stuck",
                    finishedAt: now,
                },
            });
            if (count > 0) this.logger.warn(`ai_stuck_turns failed=${count}`);
            return count;
        } catch (error) {
            if (!(error instanceof AiSettingNotConfiguredError)) {
                this.logger.error(
                    `ai_stuck_turns sweep failed: ${error instanceof Error ? error.name : "unknown"}`,
                );
            }
            return 0;
        }
    }
}
