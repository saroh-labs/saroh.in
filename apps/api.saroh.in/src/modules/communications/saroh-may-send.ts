import { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { outsideOrgContext, prisma } from "@saroh/database";

import type { ModuleAccess } from "@saroh/pricing-catalog";

import { env } from "../../env";
import { countUsage } from "../billing/metering";
import { planMeter } from "../billing/metering.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import {
    isSarohTemplate,
    SAROH_DAILY_CEILING_DEFAULT,
    SAROH_EMAILS_KEY,
    SAROH_EMAILS_ROW,
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
 * 5. its plan, enforced (`PLAN_ENFORCEMENT` on — Saroh's sending is never
 *    unmetered), has an allowance for it: a `saroh-emails` row, on, hard
 *    (a soft cell never refuses), with a number (`sarohEmailsPerMonth`, U3);
 * 6. the platform's daily ceiling has room.
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
    | "NO_ALLOWANCE"
    | "CEILING"
    | "LOOKUP_FAILED";

/** What the rule reads beyond the transaction. */
export interface SarohDeps {
    flags: Pick<FeatureFlagService, "isEnabled">;
    /** Saroh deliveries queued for every business since `since`. */
    queuedSince: (since: Date) => Promise<number>;
    /**
     * The business's `saroh-emails` row, when the plan is enforced
     * (`MeteringService.enforcedRowOrThrow`); null when enforcement is off,
     * the business is off the catalogue or its version has no such row.
     * A lookup that failed throws: the rule refuses it (LOOKUP_FAILED) and
     * Settings says it couldn't read it, never that Saroh is off.
     */
    allowance: (
        organizationId: string,
        now: Date,
    ) => Promise<ModuleAccess | null>;
    /** How many of the business's emails Saroh has counted this month. */
    used: (organizationId: string, now: Date) => Promise<number>;
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
    allowance: (organizationId, now) =>
        planMeter.enforcedRowOrThrow(organizationId, SAROH_EMAILS_ROW, now),
    used: (organizationId, now) =>
        countUsage(prisma, organizationId, SAROH_EMAILS_KEY, now),
};

/**
 * The row's monthly cap, or null (no allowance: fail closed) unless it gives
 * Saroh's emails a number above nothing. A soft cell is no allowance either:
 * the meter counts a soft row and never refuses it, so Saroh's sending would
 * be unmetered (`queueSarohInTx` refuses it the same way).
 */
export function allowanceLimit(row: ModuleAccess | null): number | null {
    if (row?.state !== "on" || row.soft) return null;
    return typeof row.limit === "number" && row.limit > 0 ? row.limit : null;
}

/**
 * The global stop, checked on every send and queued job. Env is read at
 * boot, so it takes effect once the API and workers restart with it set;
 * for an instant stop, turn off the business's `SAROH_BUSINESS_EMAIL` flag.
 */
export function sarohStopped(): boolean {
    return env.SAROH_BUSINESS_EMAIL_STOP === "true";
}

/** The platform's daily ceiling (env, else the default). */
export function sarohDailyCeiling(): number {
    const raw = Number(env.SAROH_BUSINESS_EMAIL_DAILY_CEILING);
    return Number.isInteger(raw) && raw > 0 ? raw : SAROH_DAILY_CEILING_DEFAULT;
}

/**
 * Whether this month's allowance is used: at the cap or past it. What
 * Settings calls PAUSED, and what notice reach reads as no room.
 */
export function allowancePaused(used: number, cap: number): boolean {
    return used >= cap;
}

/**
 * The business's own CONNECTED email provider's name ("RESEND", …), or
 * null: none, or one it disconnected.
 */
async function connectedProvider(
    db: ProviderDb,
    organizationId: string,
): Promise<string | null> {
    const row = await db.communicationProvider.findUnique({
        where: {
            organizationId_channel: { organizationId, channel: "EMAIL" },
        },
        select: { status: true, provider: true },
    });
    return row?.status === "CONNECTED" ? row.provider : null;
}

/**
 * The switches alone (3 and 4): what a queued Saroh send re-checks when its
 * job runs, so turning either off stops sends already queued or retrying.
 *
 * Three answers, not two: true (both on), false (one is off: the send is
 * STOPPED for good), or it throws when the flag can't be read — a lookup
 * that failed is not a switch turned off, so the job is retried with
 * backoff and the delivery stays QUEUED rather than being stopped for ever.
 * Nothing is sent while it throws, so it still fails closed.
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
        throw err;
    }
}

/** What the rule decided, with what it read on the way. */
export interface SarohDecision {
    /** Why not, or null when Saroh may send. */
    refusal: SarohRefusal | null;
    /**
     * The `saroh-emails` row it read: set whenever it got that far, so a
     * send or the Settings state counts against it without reading the
     * plan again (always set when `refusal` is null).
     */
    allowance: ModuleAccess | null;
}

export interface SarohDecisionOptions {
    /**
     * Whether the business's own provider is connected, when the caller
     * has read it already (`emailRoute`); false asks "what if it had none"
     * (the Disconnect warning's `takesOver`). Read here when left out.
     */
    providerConnected?: boolean;
}

/**
 * Why Saroh would not send `template` for this business now (null when it
 * may), with the allowance row it read. See the file's comment for the
 * rule.
 */
export async function sarohDecision(
    db: ProviderDb,
    organizationId: string,
    template: string,
    now: Date = new Date(),
    deps: SarohDeps = defaultSarohDeps,
    options: SarohDecisionOptions = {},
): Promise<SarohDecision> {
    const no = (refusal: SarohRefusal, allowance: ModuleAccess | null = null) =>
        ({ refusal, allowance }) satisfies SarohDecision;
    if (!isSarohTemplate(template)) return no("NOT_A_BOOKING_NOTICE");
    if (sarohStopped()) return no("STOPPED");
    try {
        const connected =
            options.providerConnected ??
            (await connectedProvider(db, organizationId)) !== null;
        if (connected) return no("PROVIDER_CONNECTED");
        if (
            !(await deps.flags.isEnabled(
                FlagKey.SAROH_BUSINESS_EMAIL,
                organizationId,
            ))
        ) {
            return no("SWITCHED_OFF");
        }
        // Never unmetered: enforcement off, a plan with no row, no number
        // or a soft cell gives Saroh nothing to send against (fail closed);
        // a plan that can't be read throws into LOOKUP_FAILED below.
        const allowance = await deps.allowance(organizationId, now);
        if (allowanceLimit(allowance) === null) {
            return no("NO_ALLOWANCE", allowance);
        }
        const queued = await deps.queuedSince(new Date(now.getTime() - DAY_MS));
        if (queued >= sarohDailyCeiling()) {
            logger.warn(
                `saroh_email_ceiling_reached org=${organizationId} queued=${queued}`,
            );
            return no("CEILING", allowance);
        }
        return { refusal: null, allowance };
    } catch (err) {
        logger.warn(
            `saroh_email_lookup_failed org=${organizationId} error=${err instanceof Error ? err.name : "unknown"}`,
        );
        return no("LOOKUP_FAILED");
    }
}

/** Why Saroh would not send `template` for this business now, or null. */
export async function sarohRefusal(
    db: ProviderDb,
    organizationId: string,
    template: string,
    now: Date = new Date(),
    deps: SarohDeps = defaultSarohDeps,
): Promise<SarohRefusal | null> {
    return (await sarohDecision(db, organizationId, template, now, deps))
        .refusal;
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

/**
 * Who emails a message for this business now, decided once with one read
 * of its provider:
 * - PROVIDER: its own connected provider (named), whatever the message;
 * - SAROH: none connected, and for a booking notice Saroh may send it
 *   (`sarohDecision`), with the allowance row to count against;
 * - null: nobody — with why Saroh didn't, when it was asked.
 *
 * `template` is the notice's kind; left out (an invoice, a team alert, a
 * peek at the provider alone) Saroh isn't asked at all.
 */
export type EmailRoute =
    | { route: "PROVIDER"; provider: string }
    | { route: "SAROH"; allowance: ModuleAccess }
    | { route: null; refusal: SarohRefusal | null };

export async function emailRoute(
    db: ProviderDb,
    organizationId: string,
    template?: string,
    now: Date = new Date(),
    deps: SarohDeps = defaultSarohDeps,
): Promise<EmailRoute> {
    const provider = await connectedProvider(db, organizationId);
    if (provider !== null) return { route: "PROVIDER", provider };
    if (template === undefined) return { route: null, refusal: null };
    const decision = await sarohDecision(
        db,
        organizationId,
        template,
        now,
        deps,
        { providerConnected: false },
    );
    return decision.refusal === null && decision.allowance
        ? { route: "SAROH", allowance: decision.allowance }
        : { route: null, refusal: decision.refusal ?? "NO_ALLOWANCE" };
}

/**
 * Whether the business's allowance has room for one more this month: what
 * notice reach says ("emailed") only when it is true. Not the send's check
 * (that counts under the plan-meter lock, `saroh-queue.ts`). Fails closed.
 * `allowance` is the row the rule already read (`emailRoute`); read again
 * when left out.
 */
export async function sarohRoomLeft(
    organizationId: string,
    now: Date = new Date(),
    deps: SarohDeps = defaultSarohDeps,
    allowance?: ModuleAccess | null,
): Promise<boolean> {
    try {
        const limit = allowanceLimit(
            allowance === undefined
                ? await deps.allowance(organizationId, now)
                : allowance,
        );
        if (limit === null) return false;
        return !allowancePaused(await deps.used(organizationId, now), limit);
    } catch (err) {
        logger.warn(
            `saroh_email_lookup_failed org=${organizationId} step=room error=${err instanceof Error ? err.name : "unknown"}`,
        );
        return false;
    }
}
