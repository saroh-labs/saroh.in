import { Logger } from "@nestjs/common";

import type { OwnerAlert } from "../modules/ai/ops/owner-alert";
import { OwnerAlertSender } from "../modules/ai/ops/owner-alert";
import type { WindowLimiter } from "../modules/rate-limits/shared-window";
import { SharedRateLimiter } from "../modules/rate-limits/shared-window";

const MINUTE_MS = 60_000;

/** Failed sends in 15 minutes before staff hear. */
export const DEFAULT_EMAIL_FAILURES_MIN = 5;

const logger = new Logger("EmailSendHealth");

export interface EmailHealthDeps {
    /** Failed sends, a 15-minute window. */
    failures: WindowLimiter;
    /** One alert an hour per key: `all`, or one security notice's kind. */
    alerted: WindowLimiter;
    alerts: Pick<OwnerAlertSender, "send">;
}

let shared: EmailHealthDeps | undefined;
function defaults(): EmailHealthDeps {
    shared ??= {
        failures: new SharedRateLimiter(
            "email-send-failures",
            DEFAULT_EMAIL_FAILURES_MIN,
            15 * MINUTE_MS,
        ),
        alerted: new SharedRateLimiter(
            "email-send-failing-alerted",
            1,
            60 * MINUTE_MS,
        ),
        alerts: new OwnerAlertSender(),
    };
    return shared;
}

/**
 * A mail nobody waits on failed to send (04 S13): counted, and past
 * {@link DEFAULT_EMAIL_FAILURES_MIN} in 15 minutes staff hear at ERROR and
 * by email, as WhatsApp sign-in codes do (`whatsapp-signin-health.ts`). A
 * security notice (an Owner changed, a sign-in email changed) is told at
 * once, since its reader may be the one being taken over. At most one alert
 * an hour each. True when it alerted.
 */
export async function emailSendFailed(
    security: string | null,
    deps: EmailHealthDeps = defaults(),
): Promise<boolean> {
    const under = await deps.failures.take("all");
    if (under && !security) return false;
    const key = under && security ? `security:${security}` : "all";
    if (!(await deps.alerted.take(key))) return false;
    const alert: OwnerAlert =
        key === "all"
            ? {
                  subject: "Saroh: emails are failing to send",
                  lines: [
                      "Several emails failed to send in the last 15 minutes.",
                      "Check the API log for email_send_failed and the SMTP provider.",
                  ],
                  path: "/health",
              }
            : {
                  subject: "Saroh: a security notice email failed to send",
                  lines: [
                      `A ${security} notice could not be sent, so its reader hasn't been told.`,
                      "Check the API log for email_send_failed, then tell them another way.",
                  ],
                  path: "/health",
              };
    logger.error(
        `email_send_failing ${key === "all" ? "window=15m" : `notice=${security}`}`,
    );
    void deps.alerts.send(alert);
    return true;
}
