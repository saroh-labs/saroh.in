import type { Goal } from "@/lib/modules/goals";
import { GOAL_LATER, goalFor } from "@/lib/modules/goals";

import type { OrganizationKind } from "./kind";
import { firstRunOrder } from "./kind";

/*
 * The goals setup's last step offers. The steps themselves, and where the
 * person is in them, are `setup-steps.ts`.
 */

/** One answer to "What will you do first?" at setup. */
export interface SetupGoal extends Goal {
    /** What "Create" opens, said under the choice. */
    lands: string;
}

/** Where each goal lands, in a few words. */
const LANDS: Readonly<Record<string, string>> = {
    COMMERCE: "Opens your first product.",
    APPOINTMENTS: "Opens your first service.",
    WEBSITE: "Opens your site, ready to publish.",
    CRM: "Opens your first contact.",
    INVOICE: "Opens a new invoice.",
};

/**
 * The goals setup offers, in the kind's order and words (DEC-070). The same
 * list Home's first run draws from (`lib/modules/goals.ts`), so the choice
 * is worded once. Setup can't know yet what Saroh has rolled out to a
 * business that doesn't exist, so all of a kind's goals are offered, and
 * "Create" lands on Home with one sentence when one can't be turned on.
 */
export function setupGoals(kind: OrganizationKind): SetupGoal[] {
    return firstRunOrder(kind).flatMap((key): SetupGoal[] => {
        const goal = goalFor(key, kind);
        return goal ? [{ ...goal, lands: LANDS[key] ?? "" }] : [];
    });
}

/** The goal a kind starts on: the first of its order. */
export function defaultGoal(kind: OrganizationKind): string {
    return firstRunOrder(kind)[0] ?? GOAL_LATER;
}
