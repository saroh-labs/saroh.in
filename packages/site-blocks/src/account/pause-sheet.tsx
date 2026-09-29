"use client";

import { useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { PayOption } from "../booking-flow/steps/pay-option";
import { cn } from "../lib/utils";
import type { AccountSubscription } from "./model";
import { pauseEndsOn } from "./model";
import type { PlanApi, PlanChangeResult } from "./plan-api";
import { PLAN_OFFLINE } from "./plan-api";
import { Sheet, sheetButton } from "./sheet";

/**
 * Pause a plan from the account (round-2 plan A, A8): 2, 4 or 8 weeks, and
 * nothing open-ended — "until I resume" stays with the team (D8). Each
 * choice says the day the plan starts again.
 */
export function PauseSheet({
    plan,
    weeks,
    onClose,
    pause,
    onDone,
}: {
    /** The plan to pause; the sheet is closed while null. */
    plan: AccountSubscription | null;
    /** The weeks on offer (2, 4, 8). */
    weeks: number[];
    onClose: () => void;
    pause: PlanApi["pause"];
    onDone: (result: Extract<PlanChangeResult, { ok: true }>) => void;
}) {
    return (
        <Sheet
            open={plan !== null}
            onClose={onClose}
            title="Pause your plan"
            lead="Nothing is charged while it's paused, and it starts again on its own."
        >
            {plan ? (
                // Keyed, so each opening starts fresh.
                <PauseChoice
                    key={plan.ref}
                    plan={plan}
                    weeks={weeks}
                    pause={pause}
                    onDone={onDone}
                />
            ) : null}
        </Sheet>
    );
}

function PauseChoice({
    plan,
    weeks,
    pause,
    onDone,
}: {
    plan: AccountSubscription;
    weeks: number[];
    pause: PlanApi["pause"];
    onDone: (result: Extract<PlanChangeResult, { ok: true }>) => void;
}) {
    const [chosen, setChosen] = useState<number | null>(
        weeks.includes(4) ? 4 : (weeks[0] ?? null),
    );
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const off = busy || chosen === null;

    async function submit() {
        if (chosen === null || busy) return;
        setBusy(true);
        setProblem(null);
        const result = await pause(plan.ref, chosen).catch(
            (): PlanChangeResult => ({ ok: false, message: PLAN_OFFLINE }),
        );
        setBusy(false);
        if (result.ok) onDone(result);
        else setProblem(result.message);
    }

    return (
        <>
            <div
                role="radiogroup"
                aria-label="How long"
                className="mt-3.5 grid gap-2"
            >
                {weeks.map((w) => (
                    <PayOption
                        key={w}
                        on={chosen === w}
                        label={`${w} weeks`}
                        sub={`Starts again on ${pauseEndsOn(w, plan.timezone)}`}
                        onPick={() => setChosen(w)}
                    />
                ))}
            </div>
            {problem ? (
                <p role="alert" className={cn(destructiveAlertClasses, "mt-3")}>
                    {problem}
                </p>
            ) : null}
            <button
                type="button"
                disabled={off}
                onClick={() => void submit()}
                className={sheetButton(off)}
            >
                {busy
                    ? "Pausing…"
                    : chosen === null
                      ? "Pause"
                      : `Pause for ${chosen} weeks`}
            </button>
        </>
    );
}
