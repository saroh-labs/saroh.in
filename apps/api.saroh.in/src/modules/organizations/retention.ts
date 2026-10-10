import { env } from "../../env";

/**
 * How long Saroh keeps things, in one place (DEC-119, owner 10 Oct). The
 * Privacy Policy states both numbers; change one here and there together.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days a deleted business's data is kept after its deletion window ended
 * (`Organization.deletedRetainedAt`) before `organization.retention.erase`
 * removes its files and personal data. The Privacy Policy: "Access ends at
 * once. We keep the account's data for 180 days, as Indian law requires,
 * then remove it from live systems."
 */
export const RETENTION_AFTER_DELETION_DAYS = 180;

/**
 * The days in force: {@link RETENTION_AFTER_DELETION_DAYS}, or the
 * `RETENTION_AFTER_DELETION_DAYS` environment variable when it is longer.
 * Never shorter, whatever the variable says (under `SKIP_ENV_VALIDATION`
 * it arrives unchecked, as a string).
 */
export function retentionAfterDeletionDays(
    override: unknown = env.RETENTION_AFTER_DELETION_DAYS,
): number {
    const days = Number(override);
    if (!Number.isInteger(days)) return RETENTION_AFTER_DELETION_DAYS;
    return Math.max(RETENTION_AFTER_DELETION_DAYS, days);
}

/** When a business deleted at `deletedRetainedAt` is erased. */
export function retentionEndsAt(
    deletedRetainedAt: Date,
    days: number = retentionAfterDeletionDays(),
): Date {
    return new Date(deletedRetainedAt.getTime() + days * DAY_MS);
}

/** A business deleted at or before this moment is due for erasing at `now`. */
export function retentionCutoff(
    now: Date,
    days: number = retentionAfterDeletionDays(),
): Date {
    return new Date(now.getTime() - days * DAY_MS);
}

/**
 * Days a security log row is kept (the Privacy Policy: "Security logs:
 * IP address, browser, sign-in times, errors … 1 year"). In the database
 * those are the sign-in sessions (`Session`: address, browser, sign-in
 * time), the customers' sessions and sign-in codes on a business's site
 * (`CustomerSession`, `CustomerSignInCode`), and the older store logs
 * (`AuditLog`, `SecretAccessLog`). `security-logs.retention` deletes a row
 * this long after it ended. The two audit trails (`AuditEvent`,
 * `AdminAuditEvent`) are records, not logs, and are never pruned.
 */
export const SECURITY_LOG_RETENTION_DAYS = 365;

/** A security log row that ended before this moment is past keeping. */
export function securityLogCutoff(
    now: Date,
    days: number = SECURITY_LOG_RETENTION_DAYS,
): Date {
    return new Date(now.getTime() - days * DAY_MS);
}
