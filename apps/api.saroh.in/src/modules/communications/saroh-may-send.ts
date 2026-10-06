import { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { outsideOrgContext, prisma } from "@saroh/database";

import { env } from "../../env";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import type { SarohTemplate } from "./saroh-delivery";
import {
    isSarohTemplate,
    SAROH_DAILY_CEILING_DEFAULT,
    SAROH_PROVIDER,
} from "./saroh-delivery";

/**
 * Whether Saroh sends a business's email for it (DEC-086): the one rule
 * behind the notify handler, `queueTransactional`, notice reach and the
 * send job, so what the workspace says is always what is sent.
 *
 * Saroh may send only when every one of these holds:
 * 1. the business has no CONNECTED email provider (none, or one it
 *    disconnected): its own provider always sends, and is never counted;
 * 2. the message is a booking notice (confirmed, moved, cancelled);
 * 3. the global stop (`SAROH_BUSINESS_EMAIL_STOP`) is off;
 * 4. the business's `SAROH_BUSINESS_EMAIL` flag is on;
 * 5. `PLAN_ENFORCEMENT` is on for it — Saroh's sending is never unmetered;
 * 6. its plan has an allowance for it (U3);
 * 7. the platform's daily ceiling has room.
 *
 * Every lookup that fails says no (and logs): this route spends a resource
 * every business shares, so it fails closed where other meters fail open.
 */

/** Why Saroh doesn't send, for logs and tests; null when it may. */
export type SarohRefusal =
    | "PROVIDER_CONNECTED"
    | "NOT_A_BOOKING_NOTICE"
    | "STOPPED"
    | "SWITCHED_OFF"
    | "NOT_ENFORCED"
    | "CEILING"
    | "LOOKUP_FAILED";

/** What the rule reads beyond the transaction. */
export interface SarohDeps {
    flags: Pick<FeatureFlagService, "isEnabled">;
    /** Saroh deliveries queued for every business since `since`. */
    queuedSince: (since: Date) => Promise<number>;
}

type ProviderDb = Pick<Prisma.TransactionClient, "communicationProvider">;

const logger = new Logger("SarohMaySend");

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Counted outside the business's RLS context: the ceiling is every
 * business's, and under enforcement a read in one business's context sees
 * only its own rows. Not part of the caller's transaction.
 */
function queuedSince(since: Date): Promise<number> {
    return outsideOrgContext(() =>
        prisma.delivery.count({
            where: { provider: SAROH_PROVIDER, createdAt: { gte: since } },
        }),
    );
}

export const defaultSarohDeps: SarohDeps = {
    flags: new FeatureFlagService(),
    queuedSince,
};

/** The global stop, read at use, so an operator's change needs no deploy of code. */
export function sarohStopped(): boolean {
    return env.SAROH_BUSINESS_EMAIL_STOP === "true";
}

/** The platform's daily ceiling (env, else the default). */
export function sarohDailyCeiling(): number {
    const raw = Number(env.SAROH_BUSINESS_EMAIL_DAILY_CEILING);
    return Number.isInteger(raw) && raw > 0 ? raw : SAROH_DAILY_CEILING_DEFAULT;
}

/** Whether the business's own email provider is connected. */
export async function providerConnected(
    db: ProviderDb,
    organizationId: string,
): Promise<boolean> {
    const row = await db.communicationProvider.findUnique({
        where: {
            organizationId_channel: { organizationId, channel: "EMAIL" },
        },
        select: { status: true },
    });
    return row?.status === "CONNECTED";
}

/**
 * The switches alone (3 and 4): what a queued Saroh send re-checks when its
 * job runs, so turning either off stops sends already queued or retrying.
 */
export async function sarohSwitchesOn(
    organizationId: string,
    deps: SarohDeps = defaultSarohDeps,
): Promise<boolean> {
    if (sarohStopped()) return false;
    try {
        return await deps.flags.isEnabled(
            FlagKey.SAROH_BUSINESS_EMAIL,
            organizationId,
        );
    } catch (err) {
        logger.warn(
            `saroh_email_lookup_failed org=${organizationId} step=flag error=${err instanceof Error ? err.name : "unknown"}`,
        );
        return false;
    }
}

/**
 * Why Saroh would not send `template` for this business now, or null when
 * it may. See the file's comment for the rule.
 */
export async function sarohRefusal(
    db: ProviderDb,
    organizationId: string,
    template: string,
    now: Date = new Date(),
    deps: SarohDeps = defaultSarohDeps,
): Promise<SarohRefusal | null> {
    if (!isSarohTemplate(template)) return "NOT_A_BOOKING_NOTICE";
    if (sarohStopped()) return "STOPPED";
    try {
        if (await providerConnected(db, organizationId)) {
            return "PROVIDER_CONNECTED";
        }
        if (
            !(await deps.flags.isEnabled(
                FlagKey.SAROH_BUSINESS_EMAIL,
                organizationId,
            ))
        ) {
            return "SWITCHED_OFF";
        }
        if (
            !(await deps.flags.isEnabled(
                FlagKey.PLAN_ENFORCEMENT,
                organizationId,
            ))
        ) {
            return "NOT_ENFORCED";
        }
        const queued = await deps.queuedSince(new Date(now.getTime() - DAY_MS));
        if (queued >= sarohDailyCeiling()) {
            logger.warn(
                `saroh_email_ceiling_reached org=${organizationId} queued=${queued}`,
            );
            return "CEILING";
        }
        return null;
    } catch (err) {
        logger.warn(
            `saroh_email_lookup_failed org=${organizationId} error=${err instanceof Error ? err.name : "unknown"}`,
        );
        return "LOOKUP_FAILED";
    }
}

/** Whether Saroh sends `template` for this business now (DEC-086). */
export async function sarohMaySend(
    db: ProviderDb,
    organizationId: string,
    template: string,
    now: Date = new Date(),
    deps: SarohDeps = defaultSarohDeps,
): Promise<boolean> {
    return (
        (await sarohRefusal(db, organizationId, template, now, deps)) === null
    );
}

export type { SarohTemplate };
