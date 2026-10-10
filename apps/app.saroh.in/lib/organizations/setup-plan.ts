import type { Goal } from "@/lib/modules/goals";
import { GOAL_LATER, goalFor } from "@/lib/modules/goals";

import type { OrganizationKind } from "./kind";
import { firstRunOrder } from "./kind";

/**
 * The plan from nothing to working, as the sign-up panel gives it
 * (`apps/accounts.saroh.in/components/auth/panel-copy.ts`, `PLAN_STEPS`):
 * keep the two in step. The account is step 1. Setup is ONE screen that does
 * steps 2 and 3, and it says so rather than calling itself the "last step".
 */
export const SETUP_STEPS = [
    "Make your account",
    "Name your business",
    "Pick what to do first",
] as const;

/** The step setup opens on: the account is made. */
export const SETUP_CURRENT_STEP = 2;

/** Above setup's heading, on every screen size. */
export const SETUP_STEP_LINE = "Steps 2 and 3 of 3";

/** One answer to "What will you do first?" on the setup screen. */
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
