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
 * A Saroh delivery whose connection dropped after SES had started taking
 * it (`outcomeOfError`'s `unknown`): it may have gone, so it is never
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

/** The Message statuses of a booking notice Saroh didn't email, and why. */
export type NotEmailed = typeof ALLOWANCE_USED | typeof NO_ALLOWANCE;
