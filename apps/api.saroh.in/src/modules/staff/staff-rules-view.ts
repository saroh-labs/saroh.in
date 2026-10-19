import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { BookingRulesValue } from "../bookings/booking-rules";
import type {
    PersonRules,
    RuleChanges,
    RuleRequestStatus,
} from "../bookings/person-rules";
import {
    changesWords,
    requestStatusOf,
    storedRuleChanges,
} from "../bookings/person-rules";

/**
 * What the API answers about each person's own booking rules and the
 * requests to change them (DEC-170, #1038): the views, and a request row
 * read out with who asked and who decided, as they are now.
 */

/** The timing rules, as a person's diary keeps them. */
export type TimingRules = Pick<
    BookingRulesValue,
    "bookAheadDays" | "latestBookingMinutes" | "freeCancelHours" | "gapMinutes"
>;

/** Someone a request names, as they are now. */
export interface RulePerson {
    userId: string;
    name: string | null;
}

/** A request to change someone's own booking rules. */
export interface RuleRequestView {
    id: string;
    staffId: string;
    staffName: string;
    status: RuleRequestStatus;
    /** The asked values, by field; a null is "same as the business". */
    changes: RuleChanges;
    /** The same, as the boards say them. */
    words: string[];
    /** Why it was turned down, when the owner said. */
    reason: string | null;
    requestedBy: RulePerson;
    createdAt: Date;
    decidedAt: Date | null;
    decidedBy: RulePerson | null;
}

/** One person's booking rules, and what the caller may do with them. */
export interface PersonRulesView {
    staffId: string;
    name: string;
    /** Their own; a null is "same as the business". */
    own: PersonRules;
    /** The business's. */
    business: TimingRules;
    /** What their diary keeps: theirs, else the business's, field by field. */
    effective: TimingRules;
    /** Whether the caller may change them at all. */
    canChange: boolean;
    /** Whether a change the caller makes waits for approval. */
    needsApproval: boolean;
    /**
     * The request waiting, or the last one decided until its person says
     * OK to it (`dismiss`); null with neither.
     */
    request: RuleRequestView | null;
}

/** What saving someone's rules did. */
export interface PersonRulesSaved {
    /** True: in force now. False: waiting for approval (`rules.request`). */
    applied: boolean;
    /**
     * Their own rules before the save — what Undo sends back with the same
     * `PUT` when it applied at once.
     */
    previous: PersonRules;
    rules: PersonRulesView;
}

export type RequestRow = Prisma.StaffRuleRequestGetPayload<{
    include: { staff: { select: { name: true } } };
}>;

/** The timing rules alone. */
export function timing(rules: BookingRulesValue): TimingRules {
    return {
        bookAheadDays: rules.bookAheadDays,
        latestBookingMinutes: rules.latestBookingMinutes,
        freeCancelHours: rules.freeCancelHours,
        gapMinutes: rules.gapMinutes,
    };
}

/** Requests as the API sends them, with the people they name. */
export async function requestViews(
    rows: RequestRow[],
): Promise<RuleRequestView[]> {
    const ids = new Set<string>();
    for (const row of rows) {
        ids.add(row.requestedByUserId);
        if (row.decidedByUserId) ids.add(row.decidedByUserId);
    }
    const users =
        ids.size > 0
            ? await prisma.user.findMany({
                  where: { id: { in: [...ids] } },
                  select: { id: true, name: true },
              })
            : [];
    const names = new Map(users.map((u) => [u.id, u.name]));
    const who = (userId: string): RulePerson => ({
        userId,
        name: names.get(userId) ?? null,
    });
    return rows.map((row) => {
        const changes = storedRuleChanges(row.changes);
        return {
            id: row.id,
            staffId: row.staffId,
            staffName: row.staff.name,
            status: requestStatusOf(row.status),
            changes,
            words: changesWords(changes),
            reason: row.reason,
            requestedBy: who(row.requestedByUserId),
            createdAt: row.createdAt,
            decidedAt: row.decidedAt,
            decidedBy: row.decidedByUserId ? who(row.decidedByUserId) : null,
        };
    });
}

/** How a decided request reads in a refusal. */
export function outcomeWords(status: RuleRequestStatus): string {
    switch (status) {
        case "APPROVED":
            return "approved";
        case "TURNED_DOWN":
            return "turned down";
        case "WITHDRAWN":
            return "withdrawn";
        case "WAITING":
            return "sent";
    }
}
