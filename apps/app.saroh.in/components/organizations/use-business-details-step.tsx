"use client";

import { useRef, useState } from "react";

import { BusinessDetailsSheet } from "@/components/organizations/business-details-sheet";
import type { BusinessDetail } from "@/lib/organizations/business-details";

/** Any action's result: a success, or a failure that may name what's missing. */
interface Outcome {
    ok: boolean;
    missing?: BusinessDetail[];
}

/**
 * Carry an action through the business-details step (DEC-068). `run` calls
 * the action; when the API refuses it for want of the registered address
 * or GSTIN, the "Add your business details" sheet opens in place, and once
 * saved the same action runs again and its result is returned as if
 * nothing had stood in the way. Closed without saving, `run` answers
 * `null`: the merchant chose not to, so there is nothing to report.
 *
 * Render `step` once, beside whatever opened it.
 */
export function useBusinessDetailsStep({
    then,
    continueLabel,
}: {
    /** What happens once saved ("issue it"). */
    then: string;
    /** The sheet's Save ("Save and issue"). */
    continueLabel: string;
}) {
    const [missing, setMissing] = useState<BusinessDetail[] | null>(null);
    const answer = useRef<((saved: boolean) => void) | null>(null);

    async function run<R extends Outcome>(
        action: () => Promise<R>,
    ): Promise<R | null> {
        const res = await action();
        if (res.ok || !res.missing?.length) return res;
        const askFor = res.missing;
        const saved = await new Promise<boolean>((resolve) => {
            answer.current = resolve;
            setMissing(askFor);
        });
        if (!saved) return null;
        return run(action);
    }

    const done = (saved: boolean) => {
        setMissing(null);
        answer.current?.(saved);
        answer.current = null;
    };

    const step = (
        <BusinessDetailsSheet
            open={missing !== null}
            missing={missing ?? []}
            then={then}
            continueLabel={continueLabel}
            onDone={done}
        />
    );
    return { run, step };
}
