import type { Prisma } from "@saroh/database";

import { noticeOn } from "../communications/notice-settings";
import {
    CUSTOMER_NOTIFY_TYPE,
    cancelHeldCustomerNotice,
    enqueueCustomerNotice,
    enqueueHeldCustomerNotice,
} from "../site-accounts/customer-notify-queue";
import {
    MEMBERSHIP_NOTICE_OF,
    membershipNoticeKey,
} from "../site-accounts/notices/membership";

/**
 * Telling a member about their membership (DEC-174 U11, #1142): queued
 * with the `SubscriptionEvent` it is about, on the same transaction, by
 * `recordSubscriptionEvent`, so every way a membership changes (the desk,
 * the member's own account, joining online, a pause's end date, a booked
 * plan change taking effect) tells the member the same way, once.
 *
 * - **The switch.** Nothing is queued while the business has Membership
 *   emails off (`noticeOn`, read on this transaction); the event is still
 *   written.
 * - **The Undo.** A team member's pause, resume, cancel, keep and plan
 *   change each have an Undo beside them in the workspace, so their notice
 *   is held ({@link enqueueHeldCustomerNotice}). The Undo is the inverse
 *   action (a pause's is a resume), so a change that takes back one the
 *   member hasn't been told of yet withdraws that notice and queues none
 *   of its own: pause then Undo sends nothing.
 * - **What it says** is read again when it runs (`notices/membership.ts`).
 */

type Tx = Prisma.TransactionClient;

/** The changes a team member makes with an Undo beside them. */
const HELD = new Set([
    "PAUSED",
    "RESUMED",
    "CANCELLED",
    "CANCEL_SCHEDULED",
    "KEPT",
    "PLAN_CHANGE_BOOKED",
    "PLAN_CHANGE_CANCELLED",
]);

/** What each change takes back: an Undo of the one before it. */
const TAKES_BACK: Partial<Record<string, readonly string[]>> = {
    PAUSED: ["RESUMED"],
    RESUMED: ["PAUSED"],
    KEPT: ["CANCEL_SCHEDULED"],
    CANCEL_SCHEDULED: ["KEPT"],
    PLAN_CHANGE_CANCELLED: ["PLAN_CHANGE_BOOKED"],
    PLAN_CHANGE_BOOKED: ["PLAN_CHANGE_CANCELLED"],
};

export type MembershipNoticeOutcome =
    /** Not a change a member is told about. */
    | "none"
    /** Membership emails are off. */
    | "off"
    /** It took back a change not yet told: neither is sent. */
    | "withdrawn"
    | "held"
    | "queued";

/** Queue the notice for one event just written. */
export async function queueMembershipNotice(
    tx: Tx,
    organizationId: string,
    change: {
        /** The SubscriptionEvent just written. */
        event: { id: string };
        subscriptionId: string;
        kind: string;
        actorKind: string;
    },
    now: Date = new Date(),
): Promise<MembershipNoticeOutcome> {
    const { subscriptionId, kind, actorKind } = change;
    const notice = MEMBERSHIP_NOTICE_OF[kind];
    if (!notice) return "none";
    if (!(await noticeOn(tx, organizationId, "MEMBERSHIP"))) return "off";

    const takesBack = TAKES_BACK[kind] ?? [];
    if (
        takesBack.length > 0 &&
        (await withdrawUntold(tx, organizationId, subscriptionId, takesBack))
    ) {
        return "withdrawn";
    }
    // A plan change booked again replaces the one before: only the last is
    // told, if the first is still waiting.
    if (kind === "PLAN_CHANGE_BOOKED") {
        await withdrawUntold(tx, organizationId, subscriptionId, [
            "PLAN_CHANGE_BOOKED",
        ]);
    }

    const payload = {
        kind: notice,
        eventKey: membershipNoticeKey(change.event.id),
        subscriptionId,
        subscriptionEventId: change.event.id,
    };
    const byTeam = actorKind === "TEAM" || actorKind === "OPERATOR";
    if (byTeam && HELD.has(kind)) {
        await enqueueHeldCustomerNotice(tx, organizationId, payload, { now });
        return "held";
    }
    await enqueueCustomerNotice(tx, organizationId, payload);
    return "queued";
}

/**
 * Take back this membership's notices still waiting to go for the given
 * changes. Whether any was.
 */
async function withdrawUntold(
    tx: Tx,
    organizationId: string,
    subscriptionId: string,
    kinds: readonly string[],
): Promise<boolean> {
    const waiting = await tx.job.findMany({
        where: {
            organizationId,
            type: CUSTOMER_NOTIFY_TYPE,
            status: "PENDING",
            payload: { path: ["subscriptionId"], equals: subscriptionId },
        },
        select: { payload: true },
    });
    const eventIds = waiting.flatMap((j) => {
        const id = (j.payload as { subscriptionEventId?: unknown } | null)
            ?.subscriptionEventId;
        return typeof id === "string" ? [id] : [];
    });
    if (eventIds.length === 0) return false;
    const events = await tx.subscriptionEvent.findMany({
        where: {
            organizationId,
            subscriptionId,
            id: { in: eventIds },
            kind: { in: [...kinds] },
        },
        select: { id: true },
    });
    let withdrawn = false;
    for (const e of events) {
        const { cancelled, told } = await cancelHeldCustomerNotice(
            tx,
            organizationId,
            membershipNoticeKey(e.id),
        );
        // Already told: the member heard of it, so they hear of this too.
        withdrawn ||= cancelled && !told;
    }
    return withdrawn;
}
