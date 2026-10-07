import { Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { DateTime } from "luxon";

import { businessTimezone } from "../bookings/staff-availability";
import { CatalogueAccessService } from "./catalogue-access.service";

/**
 * Telling a business its plan changed (UX-041): Saroh's staff put it on a
 * plan until a date, ended that early, or the date came and it went back
 * to its own plan. Before, nothing was raised and the business found out
 * from a lock.
 *
 * The producer queues `plan.change.notice` on the change's own transaction
 * (`enqueuePlanChangeNotice`); one whose plan ends later is queued for that
 * instant. The handler re-reads the plan the business is on now and words
 * the notice from it: a change that didn't move the plan (or was undone)
 * says nothing, and an override that was ended or replaced before its date
 * says nothing at its date (ending it told already). Once per event,
 * claimed as a `CustomerNotice` (`PLAN_CHANGED`) before the inbox row
 * (`plan.changed`, the owners' and admins' bell, as a limit notice is).
 */

/** The job type. */
export const PLAN_CHANGE_NOTICE_TYPE = "plan.change.notice";

/** The inbox notice it writes. */
export const PLAN_CHANGED_NOTIFICATION_TYPE = "plan.changed";

/** The once-only claim (`CustomerNotice.kind`). */
const PLAN_CHANGED_KIND = "PLAN_CHANGED";

export interface PlanChangeNoticePayload {
    /** Unique per business: what makes it once-only. */
    eventKey: string;
    /** The plan it was on before; nothing is said while it still is. */
    fromPlanId: string | null;
    /** The plan override the change is about, re-read when it runs. */
    overrideId?: string;
    /** "ended": its end date came; anything else is a change made now. */
    reason: "set" | "removed" | "ended";
}

type Tx = Pick<Prisma.TransactionClient, "job">;

/** Queue the notice on the change's own transaction (the outbox). */
export async function enqueuePlanChangeNotice(
    tx: Tx,
    organizationId: string,
    payload: PlanChangeNoticePayload,
    runAt?: Date,
): Promise<void> {
    await tx.job.create({
        data: {
            organizationId,
            type: PLAN_CHANGE_NOTICE_TYPE,
            payload: { ...payload },
            ...(runAt ? { runAt } : {}),
        },
    });
}

/** "31 Dec 2027", in the business's zone. */
export function planDate(at: Date, zone: string): string {
    return DateTime.fromJSDate(at, { zone }).toFormat("d LLL yyyy");
}

/**
 * The notice's words. Pure. `plans` is the version's order, lowest first,
 * which says whether the move went down (limits may be lower) or up.
 */
export function planChangeWords(input: {
    plans: Catalog["plans"];
    toPlanId: string;
    fromPlanId: string | null;
    /** An override's end, when the plan it is on now runs out. */
    until: string | null;
    /** Where it goes back to at `until`. */
    afterName: string | null;
}): { title: string; body: string } {
    const name = (id: string | null) =>
        input.plans.find((p) => p.id === id)?.name ?? id ?? "";
    const to = name(input.toPlanId);
    const toAt = input.plans.findIndex((p) => p.id === input.toPlanId);
    const fromAt = input.plans.findIndex((p) => p.id === input.fromPlanId);
    const down = fromAt >= 0 && toAt >= 0 && toAt < fromAt;
    const first = down
        ? `What you already have stays. Where ${to}'s limits are lower, adding more waits until you choose a plan with room.`
        : `Everything ${to} comes with is yours to use now.`;
    const then =
        input.until && input.afterName && input.afterName !== to
            ? ` After ${input.until} you're on ${input.afterName}.`
            : "";
    return {
        title: input.until
            ? `You're on ${to} until ${input.until}`
            : `You're on ${to} now`,
        body: `${first}${then}`,
    };
}

function payloadOf(value: unknown): PlanChangeNoticePayload | null {
    if (typeof value !== "object" || value === null) return null;
    const p = value as Partial<PlanChangeNoticePayload>;
    if (typeof p.eventKey !== "string" || p.eventKey === "") return null;
    if (p.reason !== "set" && p.reason !== "removed" && p.reason !== "ended") {
        return null;
    }
    return {
        eventKey: p.eventKey,
        fromPlanId: typeof p.fromPlanId === "string" ? p.fromPlanId : null,
        reason: p.reason,
        ...(typeof p.overrideId === "string"
            ? { overrideId: p.overrideId }
            : {}),
    };
}

@Injectable()
export class PlanChangeNoticeHandler {
    private readonly logger = new Logger(PlanChangeNoticeHandler.name);

    constructor(private readonly access: CatalogueAccessService) {}

    readonly handle = async (job: Job): Promise<void> => {
        const p = payloadOf(job.payload);
        const organizationId = job.organizationId;
        if (!p || !organizationId) {
            this.logger.error(`plan_change_notice_bad_payload job=${job.id}`);
            return;
        }
        const skip = (reason: string) =>
            this.logger.log(
                `plan_change_notice_skipped job=${job.id} reason=${reason}`,
            );
        const now = new Date();
        const override = p.overrideId
            ? await prisma.entitlementOverride.findFirst({
                  where: { id: p.overrideId, organizationId },
                  select: { expiresAt: true, revokedAt: true },
              })
            : null;
        // Ended or replaced before its date: ending it said so already.
        if (
            p.reason === "ended" &&
            override?.revokedAt &&
            (!override.expiresAt || override.revokedAt < override.expiresAt)
        ) {
            return skip("ended_early");
        }
        const a = await this.access.resolve(organizationId, now);
        if (a.source !== "catalogue") return skip("off_catalogue");
        if (a.planId === p.fromPlanId) return skip("unchanged");

        // Still on the override just set: say until when, and what's next.
        const running =
            p.reason === "set" &&
            override &&
            !override.revokedAt &&
            override.expiresAt &&
            override.expiresAt > now
                ? override.expiresAt
                : null;
        const zone = running
            ? await businessTimezone(prisma, organizationId)
            : null;
        const words = planChangeWords({
            plans: a.catalog.plans,
            toPlanId: a.planId,
            fromPlanId: p.fromPlanId,
            until: running && zone ? planDate(running, zone) : null,
            afterName:
                a.catalog.plans.find((plan) => plan.id === a.basePlanId)
                    ?.name ?? null,
        });

        await prisma.$transaction(async (tx) => {
            const claim = await tx.customerNotice.createMany({
                data: [
                    {
                        organizationId,
                        eventKey: p.eventKey,
                        kind: PLAN_CHANGED_KIND,
                    },
                ],
                skipDuplicates: true,
            });
            if (claim.count === 0) return;
            const notice = await tx.notification.create({
                data: {
                    organizationId,
                    type: PLAN_CHANGED_NOTIFICATION_TYPE,
                    title: words.title,
                    body: words.body,
                },
                select: { id: true },
            });
            await tx.customerNotice.updateMany({
                where: { organizationId, eventKey: p.eventKey },
                data: { notificationId: notice.id },
            });
        });
    };
}
