import { Logger } from "@nestjs/common";

import { env } from "../../env";
import type { OwnerAlert } from "../ai/ops/owner-alert";
import { OwnerAlertSender } from "../ai/ops/owner-alert";
import type { WindowLimiter } from "../rate-limits/shared-window";
import { SharedRateLimiter } from "../rate-limits/shared-window";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Defaults when `WHATSAPP_CODES_PER_HOUR` / `_PER_DAY` are unset: well
 * above real sign-in traffic, well below what a stranger-spraying script
 * would send in a day. Ops numbers, not plan limits.
 */
export const DEFAULT_CODES_PER_HOUR = 100;
export const DEFAULT_CODES_PER_DAY = 500;

let lastAlertAt = Number.NEGATIVE_INFINITY;

/**
 * The platform-wide ceiling on Saroh-paid WhatsApp sign-in codes (03-H1,
 * 03-M4): every code is billed to Saroh and lands on a stranger's phone if
 * the number isn't theirs, so past this many in a window (an hour, and a
 * day from the first code of it) no more go until the window turns. The
 * person is told to use SMS, which still works.
 *
 * Counted in Redis (`SharedRateLimiter`), so every replica shares it and a
 * deploy doesn't reset it; per replica when Redis is down (WARN).
 *
 * Crossing it logs `account_phone_whatsapp_ceiling` at ERROR and emails
 * every Platform owner, at most once an hour per replica.
 */
export class WhatsappCeiling {
    private readonly logger = new Logger(WhatsappCeiling.name);

    constructor(
        private readonly perHour: number = Number(
            env.WHATSAPP_CODES_PER_HOUR ?? DEFAULT_CODES_PER_HOUR,
        ) || DEFAULT_CODES_PER_HOUR,
        private readonly perDay: number = Number(
            env.WHATSAPP_CODES_PER_DAY ?? DEFAULT_CODES_PER_DAY,
        ) || DEFAULT_CODES_PER_DAY,
        private readonly hour: WindowLimiter = new SharedRateLimiter(
            "whatsapp-codes-hour",
            perHour,
            HOUR_MS,
        ),
        private readonly day: WindowLimiter = new SharedRateLimiter(
            "whatsapp-codes-day",
            perDay,
            DAY_MS,
        ),
        private readonly alerts: Pick<
            OwnerAlertSender,
            "send"
        > = new OwnerAlertSender(),
    ) {}

    /** Takes one code against both windows; false past either. */
    async allows(now: number = Date.now()): Promise<boolean> {
        const ok =
            (await this.hour.take("all", now)) &&
            (await this.day.take("all", now));
        if (!ok) this.crossed(now);
        return ok;
    }

    private crossed(now: number): void {
        if (now - lastAlertAt < HOUR_MS) return;
        lastAlertAt = now;
        this.logger.error(
            `account_phone_whatsapp_ceiling per_hour=${this.perHour} per_day=${this.perDay}: WhatsApp sign-in codes are paused until the window turns; SMS still sends`,
        );
        const alert: OwnerAlert = {
            subject: "Saroh: WhatsApp sign-in codes paused at the ceiling",
            lines: [
                `More than ${this.perHour} WhatsApp sign-in codes in an hour, or ${this.perDay} in a day, were asked for.`,
                "No more are sent until the window turns; people are offered SMS instead.",
                "If this is real traffic, raise WHATSAPP_CODES_PER_HOUR or WHATSAPP_CODES_PER_DAY. If not, someone is spraying codes: check the API log for account_phone_blocked.",
            ],
            path: "/",
        };
        void this.alerts.send(alert, new Date(now));
    }
}

/** For tests: forget when the last alert went. */
export function resetCeilingAlert(): void {
    lastAlertAt = Number.NEGATIVE_INFINITY;
}
