"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/session";

import type { FirstGoalOutcome } from "./first-goal";
import { startWithGoal } from "./first-goal";
import { listModules } from "./service";
import { enableModule, getSetupDefaults } from "./turn-on-service";

/**
 * Setup's "Create", after the business exists and is the open one: turn its
 * first goal on with the defaults and say where to land (`first-goal.ts`).
 * The rail, Home and every module's screens change with it, so the whole
 * layout is read again.
 */
export async function startWithGoalAction(
    goal: string,
    kind?: string,
): Promise<FirstGoalOutcome> {
    await requireSession();
    const outcome = await startWithGoal(
        { listModules, getSetupDefaults, enableModule },
        goal,
        kind,
    );
    if (outcome.turnedOn.length > 0) revalidatePath("/", "layout");
    return outcome;
}
