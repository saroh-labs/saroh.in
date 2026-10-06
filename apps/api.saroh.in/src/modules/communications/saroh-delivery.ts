import type { Prisma } from "@saroh/database";

import type { NoticeTemplate } from "./transactional";

/**
 * The words a Saroh-sent email is recorded in (DEC-086). A leaf: the send
 * path, the switches and the plan's count (`billing/metering.ts`) all read
 * them, so what is counted is exactly what was queued.
 */

/** `Delivery.provider` of an email Saroh sends for a business. */
export const SAROH_PROVIDER = "SAROH";

/**
 * How many times a Saroh send is tried before it is given up. The job is
 * queued with this many attempts, and each one adds one to
 * `Delivery.attempts`, so a FAILED delivery with this many has none left.
 */
export const SAROH_SEND_ATTEMPTS = 5;

/**
 * A Saroh delivery that will never be tried: a switch was off when its job
 * ran. Terminal, and never counted.
 */
export const SAROH_STOPPED = "STOPPED";

/**
 * A Saroh delivery whose connection dropped mid-session with no reply from
 * SES (`outcomeOfError`'s `unknown`): SES may have taken it, so it is never
 * retried, and it counts.
 */
export const SAROH_UNKNOWN = "UNKNOWN";

/** The notices Saroh may send while a business has no email of its own. */
export const SAROH_TEMPLATES = [
    "BOOKING_CONFIRMED",
    "BOOKING_MOVED",
    "BOOKING_CANCELLED",
] as const satisfies readonly NoticeTemplate[];
export type SarohTemplate = (typeof SAROH_TEMPLATES)[number];

/**
 * Every booking notice reads alike under the rule, so one stands for them
 * where nothing names a kind: notice reach's peek and Settings' state.
 */
export const SAROH_REPRESENTATIVE_NOTICE: SarohTemplate = SAROH_TEMPLATES[0];

export function isSarohTemplate(value: unknown): value is SarohTemplate {
    return (SAROH_TEMPLATES as readonly unknown[]).includes(value);
}

/**
 * The Saroh deliveries a plan's allowance counts: every one queued, unless
 * it was stopped before it went or failed with no attempt left. A FAILED one
 * still due a retry counts, so the cap can't be passed between attempts.
 */
export const COUNTED_SAROH_DELIVERIES: Prisma.DeliveryWhereInput = {
    provider: SAROH_PROVIDER,
    NOT: [
        { status: SAROH_STOPPED },
        { status: "FAILED", attempts: { gte: SAROH_SEND_ATTEMPTS } },
    ],
};

/**
 * The platform's daily ceiling on Saroh-sent business email when
 * `SAROH_BUSINESS_EMAIL_DAILY_CEILING` is unset: well under any SES
 * production quota, so sign-in codes always have room on the account.
 */
export const SAROH_DAILY_CEILING_DEFAULT = 1_000;

/** The plans catalogue's row for Saroh's emails, and the limit it counts. */
export const SAROH_EMAILS_ROW = "saroh-emails";
export const SAROH_EMAILS_KEY = "sarohEmailsPerMonth";

/**
 * A booking notice Saroh didn't email because the business's allowance was
 * used (`Message.status`; no delivery, no job). The thread message stands.
 */
export const ALLOWANCE_USED = "ALLOWANCE_USED";

/**
 * A booking notice Saroh didn't email because, when it went to count it,
 * the plan gave Saroh's emails no allowance or it couldn't be read (fail
 * closed; a failed read logs `plan_meter_unresolved`).
 */
export const NO_ALLOWANCE = "NO_ALLOWANCE";

/**
 * At most this many emails Saroh sends about one booking in any 24 hours
 * (DEC-086): a customer moving a booking again and again can't drain the
 * business's allowance or feed complaints through Saroh's address. Only on
 * Saroh's route; a business's own provider has no such cap.
 */
export const SAROH_EMAILS_PER_BOOKING_PER_DAY = 3;

/**
 * A booking notice Saroh didn't email because that booking already had
 * {@link SAROH_EMAILS_PER_BOOKING_PER_DAY} in the last 24 hours (no
 * delivery, no job, not counted against the allowance). The thread message
 * stands.
 */
export const BOOKING_LIMIT = "BOOKING_LIMIT";

/** The Message statuses of a booking notice Saroh didn't email, and why. */
export type NotEmailed =
    typeof ALLOWANCE_USED | typeof NO_ALLOWANCE | typeof BOOKING_LIMIT;
