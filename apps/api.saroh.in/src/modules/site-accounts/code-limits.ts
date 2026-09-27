import type { Prisma } from "@saroh/database";

/**
 * How many sign-in codes a site sends, and to whom (ADR-011; round-2 plan A,
 * A2, default 5).
 *
 * Sign-in is always on and there is no guest form, so a refused code is a
 * refused booking. The rule every limit here keeps: **no limit someone else
 * can fill refuses a customer a code.**
 *
 * - **The visitor's own limits** (one email from one visitor address): a
 *   resend no sooner than 30 s, at most 5 an hour and 10 a day. These are
 *   the only limits that refuse, and they say when to try again.
 * - **One email across addresses:** past 20 a day the email is flooded by
 *   someone. Every further code needs the bot challenge and waits 10
 *   minutes after the previous one, so the real customer still gets one
 *   within 10 minutes and the flooder at most 6 an hour.
 * - **The business, for emails new to it:** past half its hourly ceiling a
 *   new email needs the challenge; past all of it codes still go to anyone
 *   who passes, and Saroh is alerted. Returning customers never count and
 *   are never challenged by it.
 * - **The business, every code today** (the sender's reputation): past it,
 *   the challenge for everyone and an alert; never a refusal.
 *
 * The per-address request limiter (in-process, keyed by the relayed
 * address) sits in front of this in the service. Every count here is of
 * `CustomerSignInCode` rows, so it holds across API instances and restarts.
 * The ceilings are starting values, tuned from the first weeks' rows.
 */
export const CODE_TTL_MS = 10 * 60_000;
export const CODE_MAX_ATTEMPTS = 5;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const OWN_RESEND_MS = 30_000;
export const OWN_PER_HOUR = 5;
export const OWN_PER_DAY = 10;
export const DESTINATION_PER_DAY = 20;
export const FLOOD_WAIT_MS = 10 * MINUTE;

/** A business this young gets the lower ceilings. */
export const NEW_BUSINESS_MS = 14 * DAY;

export interface Ceilings {
    /** Codes to emails new to the business, per hour. */
    newDestinationsPerHour: number;
    /** Every code the business's sites send, per day. */
    codesPerDay: number;
}

export const CEILINGS: Ceilings = {
    newDestinationsPerHour: 60,
    codesPerDay: 1_000,
};
export const NEW_BUSINESS_CEILINGS: Ceilings = {
    newDestinationsPerHour: 20,
    codesPerDay: 200,
};

export function ceilingsFor(businessCreatedAt: Date, now: Date): Ceilings {
    return now.getTime() - businessCreatedAt.getTime() < NEW_BUSINESS_MS
        ? NEW_BUSINESS_CEILINGS
        : CEILINGS;
}

/** What the rows say, over the last day. */
export interface CodeCounts {
    /** When each code for this email from this visitor address was made. */
    own: Date[];
    /** Codes for this email from any address. */
    destinationToday: number;
    /** The newest code for this email from any address. */
    destinationLatest: Date | null;
    /** The business's codes to new emails in the last hour. */
    businessNewLastHour: number;
    /** The business's codes of any kind today. */
    businessToday: number;
}

export type CeilingAlert = "new-destinations" | "daily";

export type CodeDecision =
    /** The visitor's own limit: 429, with when to try again. */
    | { kind: "refuse"; retryAfterSeconds: number }
    /** A shared ceiling: not a refusal, a wait of at most 10 minutes. */
    | { kind: "wait"; retryAfterSeconds: number }
    | { kind: "send"; challenge: boolean; alerts: CeilingAlert[] };

function seconds(ms: number): number {
    return Math.max(1, Math.ceil(ms / 1000));
}

/** When the oldest of `times` inside `windowMs` leaves it. */
function windowFreesAt(times: Date[], windowMs: number, now: number): number {
    const inWindow = times
        .map((t) => t.getTime())
        .filter((t) => now - t < windowMs)
        .sort((a, b) => a - b);
    return (inWindow[0] ?? now) + windowMs;
}

export function decideCodeRequest(input: {
    counts: CodeCounts;
    newDestination: boolean;
    ceilings: Ceilings;
    now: Date;
}): CodeDecision {
    const { counts, newDestination, ceilings } = input;
    const now = input.now.getTime();

    // 1. The visitor's own limits — the only refusals.
    const own = counts.own.map((t) => t.getTime());
    const latestOwn = Math.max(0, ...own);
    if (latestOwn && now - latestOwn < OWN_RESEND_MS) {
        return {
            kind: "refuse",
            retryAfterSeconds: seconds(latestOwn + OWN_RESEND_MS - now),
        };
    }
    const ownDay = own.filter((t) => now - t < DAY).length;
    if (ownDay >= OWN_PER_DAY) {
        return {
            kind: "refuse",
            retryAfterSeconds: seconds(
                windowFreesAt(counts.own, DAY, now) - now,
            ),
        };
    }
    const ownHour = own.filter((t) => now - t < HOUR).length;
    if (ownHour >= OWN_PER_HOUR) {
        return {
            kind: "refuse",
            retryAfterSeconds: seconds(
                windowFreesAt(counts.own, HOUR, now) - now,
            ),
        };
    }

    // 2. A flooded email: a wait of at most 10 minutes, then the challenge.
    const flooded = counts.destinationToday >= DESTINATION_PER_DAY;
    if (flooded && counts.destinationLatest) {
        const since = now - counts.destinationLatest.getTime();
        if (since < FLOOD_WAIT_MS) {
            return {
                kind: "wait",
                retryAfterSeconds: seconds(FLOOD_WAIT_MS - since),
            };
        }
    }

    // 3. The business's ceilings: the challenge and an alert, never a refusal.
    const alerts: CeilingAlert[] = [];
    let challenge = flooded;
    if (newDestination) {
        if (counts.businessNewLastHour * 2 >= ceilings.newDestinationsPerHour) {
            challenge = true;
        }
        if (counts.businessNewLastHour >= ceilings.newDestinationsPerHour) {
            alerts.push("new-destinations");
        }
    }
    if (counts.businessToday >= ceilings.codesPerDay) {
        challenge = true;
        alerts.push("daily");
    }
    return { kind: "send", challenge, alerts };
}

/**
 * Whether the site should show the challenge before any email is typed:
 * true when the business is past half its new-email ceiling or past its
 * daily one. A flooded email is only known once it is typed.
 */
export function challengeLikely(
    businessNewLastHour: number,
    businessToday: number,
    ceilings: Ceilings,
): boolean {
    return (
        businessNewLastHour * 2 >= ceilings.newDestinationsPerHour ||
        businessToday >= ceilings.codesPerDay
    );
}

type Db = Pick<Prisma.TransactionClient, "customerSignInCode">;

/** The business-wide counts, for a request and for the options read. */
export async function loadBusinessCounts(
    db: Db,
    organizationId: string,
    now: Date,
): Promise<{ businessNewLastHour: number; businessToday: number }> {
    const hourAgo = new Date(now.getTime() - HOUR);
    const dayAgo = new Date(now.getTime() - DAY);
    const [businessNewLastHour, businessToday] = await Promise.all([
        db.customerSignInCode.count({
            where: {
                organizationId,
                newDestination: true,
                createdAt: { gt: hourAgo },
            },
        }),
        db.customerSignInCode.count({
            where: { organizationId, createdAt: { gt: dayAgo } },
        }),
    ]);
    return { businessNewLastHour, businessToday };
}

/** Every count {@link decideCodeRequest} needs, from the rows. */
export async function loadCodeCounts(
    db: Db,
    input: {
        organizationId: string;
        destinationHash: string;
        clientHash: string;
        now: Date;
    },
): Promise<CodeCounts> {
    const { organizationId, destinationHash, clientHash, now } = input;
    const dayAgo = new Date(now.getTime() - DAY);
    const [own, destinationToday, destinationLatest, business] =
        await Promise.all([
            db.customerSignInCode.findMany({
                where: {
                    organizationId,
                    destinationHash,
                    clientHash,
                    createdAt: { gt: dayAgo },
                },
                select: { createdAt: true },
            }),
            db.customerSignInCode.count({
                where: {
                    organizationId,
                    destinationHash,
                    createdAt: { gt: dayAgo },
                },
            }),
            db.customerSignInCode.findFirst({
                where: { organizationId, destinationHash },
                orderBy: { createdAt: "desc" },
                select: { createdAt: true },
            }),
            loadBusinessCounts(db, organizationId, now),
        ]);
    return {
        own: own.map((row) => row.createdAt),
        destinationToday,
        destinationLatest: destinationLatest?.createdAt ?? null,
        ...business,
    };
}
