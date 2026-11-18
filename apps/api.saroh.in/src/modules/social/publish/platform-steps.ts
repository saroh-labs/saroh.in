import type { ChannelKind, SocialMetaPort } from "../meta/social-meta.port";
import { isMetaError } from "../meta/social-meta.port";

/**
 * One delivery's next step on its platform (U6, KTD7), as one run of
 * `social.publish` takes it. Pure over the port: it reads nothing of the
 * database and writes nothing; the handler stores what it returns.
 *
 * - Facebook: one call.
 * - Instagram: the publishing limit read first, then a container, then
 *   its status read by the job coming back (1, 2, 4, 4 minutes; up to 5
 *   reads), then publish.
 * - Threads: a container, then about 30 seconds, then publish.
 * - Unclear (Meta didn't answer a publish): `UNKNOWN`, never sent again
 *   blind: the next run looks on the platform for the post's ref first.
 *
 * Token refusals are thrown (`auth`): the handler marks the channel.
 */

export interface DeliveryState {
    kind: ChannelKind;
    status: "WAITING" | "POSTING" | "UNKNOWN";
    containerId: string | null;
    checks: number;
    attempts: number;
}

export interface StepInput {
    accountId: string;
    token: string;
    imageUrl: string;
    caption: string;
    /** The post's ref, in its caption's link. */
    ref: string;
    now: Date;
    /** When the platform's limit will let one through, if Saroh can tell. */
    limitFreesAt: () => Promise<Date>;
}

/** What the step did: the delivery's new state, and when to come back. */
export interface StepOutcome {
    status: "WAITING" | "POSTING" | "POSTED" | "FAILED" | "UNKNOWN";
    containerId?: string | null;
    checks?: number;
    attempts?: number;
    platformPostId?: string | null;
    permalink?: string | null;
    reason?: string | null;
    retryAfter?: Date | null;
    /** Come back at: a container to read, an unclear publish to check. */
    again?: Date;
}

/** Container reads at most, and the wait before each. */
export const MAX_CHECKS = 5;
const CHECK_WAIT_MIN = [1, 2, 4, 4, 4];
/** Tries of a call Meta didn't answer before it is given up. */
export const MAX_ATTEMPTS = 3;
const THREADS_WAIT_MS = 30_000;

const plus = (now: Date, ms: number) => new Date(now.getTime() + ms);

export async function nextStep(
    meta: SocialMetaPort,
    d: DeliveryState,
    s: StepInput,
): Promise<StepOutcome> {
    // An unclear publish: is it there already?
    if (d.status === "UNKNOWN") {
        const found = await meta.findByRef(d.kind, s.accountId, s.token, s.ref);
        if (found) {
            return {
                status: "POSTED",
                platformPostId: found.id,
                permalink: found.permalink,
                reason: null,
            };
        }
        if (d.attempts >= MAX_ATTEMPTS) return failed("unknown");
        // Not there: start again with a fresh container.
        d = { ...d, status: "WAITING", containerId: null, checks: 0 };
    }

    if (d.kind === "FACEBOOK") {
        return publishing(meta, d, s, () =>
            meta.postPhoto(s.accountId, s.token, {
                imageUrl: s.imageUrl,
                caption: s.caption,
            }),
        );
    }
    const kind = d.kind;

    if (!d.containerId) {
        try {
            const limit = await meta.publishLimit(kind, s.accountId, s.token);
            if (limit && limit.used >= limit.total) {
                return failed("limit", await s.limitFreesAt());
            }
            const containerId = await meta.createContainer(
                kind,
                s.accountId,
                s.token,
                { imageUrl: s.imageUrl, caption: s.caption },
            );
            return {
                status: "POSTING",
                containerId,
                checks: 0,
                again: plus(
                    s.now,
                    kind === "THREADS"
                        ? THREADS_WAIT_MS
                        : CHECK_WAIT_MIN[0] * 60_000,
                ),
            };
        } catch (error) {
            return refused(error, d, s);
        }
    }

    try {
        const status = await meta.containerStatus(kind, d.containerId, s.token);
        if (status === "IN_PROGRESS") {
            const checks = d.checks + 1;
            if (checks >= MAX_CHECKS) return failed("stuck");
            return {
                status: "POSTING",
                checks,
                again: plus(s.now, (CHECK_WAIT_MIN[checks] ?? 4) * 60_000),
            };
        }
        if (status === "ERROR") return failed("media");
        if (status === "EXPIRED") {
            return {
                status: "WAITING",
                containerId: null,
                checks: 0,
                again: s.now,
            };
        }
        if (status === "PUBLISHED") {
            return { status: "UNKNOWN", attempts: d.attempts, again: s.now };
        }
    } catch (error) {
        return refused(error, d, s);
    }
    const containerId = d.containerId;
    return publishing(meta, d, s, () =>
        meta.publishContainer(kind, s.accountId, s.token, containerId),
    );
}

/** The publishing call itself: posted, or unclear, or refused. */
async function publishing(
    meta: SocialMetaPort,
    d: DeliveryState,
    s: StepInput,
    call: () => Promise<string>,
): Promise<StepOutcome> {
    let id: string;
    try {
        id = await call();
    } catch (error) {
        if (isMetaError(error, "retry")) {
            // It may have gone out: look before sending again.
            return {
                status: "UNKNOWN",
                attempts: d.attempts + 1,
                again: plus(s.now, 60_000),
            };
        }
        return refused(error, d, s);
    }
    const permalink = await meta
        .permalink(d.kind, id, s.token)
        .catch(() => null);
    return {
        status: "POSTED",
        platformPostId: id,
        permalink,
        containerId: null,
        reason: null,
    };
}

/** Meta said no: why, as the delivery keeps it. `auth` is thrown on. */
async function refused(
    error: unknown,
    d: DeliveryState,
    s: StepInput,
): Promise<StepOutcome> {
    if (!isMetaError(error)) throw error;
    switch (error.kind) {
        case "auth":
            throw error;
        case "limit":
            return failed(
                "limit",
                error.retryAfter ?? (await s.limitFreesAt()),
            );
        case "media":
            return failed("media");
        case "retry": {
            const attempts = d.attempts + 1;
            if (attempts >= MAX_ATTEMPTS) return failed("unknown");
            return {
                status: d.status === "POSTING" ? "POSTING" : "WAITING",
                attempts,
                again: plus(s.now, 2 * 60_000),
            };
        }
        default:
            return failed("unknown");
    }
}

function failed(reason: string, retryAfter: Date | null = null): StepOutcome {
    return { status: "FAILED", reason, retryAfter, containerId: null };
}
