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
 * - Unclear (Meta didn't answer a publish, or a run died mid-call):
 *   `UNKNOWN`, never sent again blind: it is looked for on the platform by
 *   the post's ref up to {@link MAX_LOOKS} times, minutes apart, before it
 *   is sent again. A container that reads PUBLISHED went out: posted.
 * - Before each publishing call the handler marks the delivery POSTING,
 *   committed (`beforePublish`), so a run that dies between Meta's answer
 *   and the record is found by the next run and looked up first (S-01).
 * - The publishing-limit read is a courtesy: Meta's reference names a
 *   User token for Instagram's and Saroh holds the Page's, so any refusal
 *   of it means "no pre-check", never a signed-out channel (S-05).
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
    /**
     * Just before a publishing call: mark the delivery POSTING with this
     * try counted, on its own committed write.
     */
    beforePublish?: (attempts: number) => Promise<void>;
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
/** Looks for an unclear post before it is sent again, and the wait before each. */
export const MAX_LOOKS = 3;
const LOOK_WAIT_MIN = [1, 2, 5];
const THREADS_WAIT_MS = 30_000;

const plus = (now: Date, ms: number) => new Date(now.getTime() + ms);

export async function nextStep(
    meta: SocialMetaPort,
    d: DeliveryState,
    s: StepInput,
): Promise<StepOutcome> {
    // An unclear publish: is it there already? Look a few times, minutes
    // apart (Meta's lists lag), before anything is sent again.
    if (d.status === "UNKNOWN") {
        const looks = d.checks + 1;
        let found;
        try {
            found = await meta.findByRef(d.kind, s.accountId, s.token, s.ref);
        } catch (error) {
            if (isMetaError(error, "auth")) throw error;
            // Couldn't look: never a reason to send again.
            return looks < MAX_LOOKS ? lookAgain(s, looks) : failed("unknown");
        }
        if (found) {
            return {
                status: "POSTED",
                platformPostId: found.id,
                permalink: found.permalink,
                containerId: null,
                reason: null,
            };
        }
        if (looks < MAX_LOOKS) return lookAgain(s, looks);
        if (d.attempts >= MAX_ATTEMPTS) return failed("unknown");
        // Not there after every look: start again with a fresh container.
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
            const limit = await meta
                .publishLimit(kind, s.accountId, s.token)
                .catch(() => null);
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
            // It went out (S-06): never sent again; its id if Meta lists it.
            const found = await meta
                .findByRef(kind, s.accountId, s.token, s.ref)
                .catch(() => null);
            return {
                status: "POSTED",
                platformPostId: found?.id ?? null,
                permalink: found?.permalink ?? null,
                containerId: null,
                reason: null,
            };
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
    const attempts = d.attempts + 1;
    await s.beforePublish?.(attempts);
    let id: string;
    try {
        id = await call();
    } catch (error) {
        if (isMetaError(error, "retry")) {
            // It may have gone out: look before sending again.
            return {
                status: "UNKNOWN",
                attempts,
                checks: 0,
                again: plus(s.now, LOOK_WAIT_MIN[0] * 60_000),
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

function lookAgain(s: StepInput, looks: number): StepOutcome {
    return {
        status: "UNKNOWN",
        checks: looks,
        again: plus(s.now, (LOOK_WAIT_MIN[looks] ?? 5) * 60_000),
    };
}

function failed(reason: string, retryAfter: Date | null = null): StepOutcome {
    return { status: "FAILED", reason, retryAfter, containerId: null };
}
