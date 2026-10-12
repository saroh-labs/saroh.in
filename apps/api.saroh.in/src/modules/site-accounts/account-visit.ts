import { prisma } from "@saroh/database";

import type { CustomerContext } from "./customer-context.decorator";

/**
 * When a customer was last here (DEC-142): what Home's "Since you were last
 * here" counts from.
 *
 * A session's own `lastSeenAt` can't say: the guard moves it before any
 * read runs, at most once an hour, on every signed-in page of the site. So
 * the account keeps two marks of its own, moved only by Home's read:
 *
 * - `lastVisitAt`: when Home was last opened;
 * - `previousVisitAt`: the visit before the one going on now.
 *
 * A visit lasts while Home is opened again within {@link VISIT_GAP_MS}. The
 * first read after a longer gap starts a new visit: what was `lastVisitAt`
 * becomes `previousVisitAt`, and that is what "since" means until the next
 * gap. So the changes stay on Home through a refresh and a look at another
 * tab, and go once the customer has been away and come back again.
 *
 * On the account, not the session, so a phone and a laptop agree.
 */

/** Opening Home again within this is the same visit. */
export const VISIT_GAP_MS = 30 * 60_000;
/** Inside a visit, `lastVisitAt` is written at most this often. */
export const VISIT_TOUCH_MS = 60_000;

export interface VisitMarks {
    lastVisitAt: Date | null;
    previousVisitAt: Date | null;
}

export interface VisitStep {
    /** What changed is counted from here; null on a first visit ever. */
    since: Date | null;
    /** The marks to write, or null when nothing moves. */
    write: Partial<VisitMarks> | null;
}

/** The rule itself: where "since" stands now, and what a read at `now` writes. */
export function visitStep(marks: VisitMarks, now: Date): VisitStep {
    const { lastVisitAt, previousVisitAt } = marks;
    if (!lastVisitAt) {
        // Never here before: nothing to compare with.
        return { since: null, write: { lastVisitAt: now } };
    }
    const away = now.getTime() - lastVisitAt.getTime();
    if (away >= VISIT_GAP_MS) {
        return {
            since: lastVisitAt,
            write: { previousVisitAt: lastVisitAt, lastVisitAt: now },
        };
    }
    return {
        since: previousVisitAt,
        // A clock that ran backwards writes nothing.
        write: away >= VISIT_TOUCH_MS ? { lastVisitAt: now } : null,
    };
}

/**
 * Home is being read: where "since" stands, moving the marks as the rule
 * says. Scoped to the signed-in customer's own account in their business.
 */
export async function readVisit(
    ctx: Pick<CustomerContext, "organizationId" | "accountId">,
    now: Date,
): Promise<Date | null> {
    const account = await prisma.customerAccount.findFirst({
        where: { id: ctx.accountId, organizationId: ctx.organizationId },
        select: { lastVisitAt: true, previousVisitAt: true },
    });
    if (!account) return null;
    const step = visitStep(account, now);
    if (step.write) {
        await prisma.customerAccount.updateMany({
            where: { id: ctx.accountId, organizationId: ctx.organizationId },
            data: step.write,
        });
    }
    return step.since;
}
