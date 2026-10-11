"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { UseFormReturn } from "react-hook-form";

import { toFirstErrorIn } from "@/lib/hooks/page-form";
import type { SetupStepId, SetupValues } from "@/lib/organizations/setup-steps";
import {
    openStep,
    SETUP_STEPS,
    stepBefore,
    stepIndex,
} from "@/lib/organizations/setup-steps";

import { useSetupStep } from "./setup-step-context";

/** The answers a step asks for. */
export function fieldsOf(step: SetupStepId) {
    return SETUP_STEPS[stepIndex(step)]?.fields ?? [];
}

/**
 * Walking setup's steps: which one may be shown, and where the keyboard
 * goes when it changes.
 *
 * - A step whose earlier steps are not answered gives way to the first
 *   that is not, before it is painted. That covers a reload, a link
 *   straight to a later step and the browser's Forward. Arriving, nothing
 *   is called wrong. Sent back by Forward, the step says why.
 * - A new step starts at its top: its heading takes the keyboard, so a
 *   screen reader says the question and Tab goes to its first answer. Not
 *   on arrival, where the page's own title has just been read.
 * - A problem found on another step (the create refusing a web address)
 *   shows that step with the keyboard on the field, not on the heading.
 */
export function useSetupWalk({
    ready,
    needsName,
    form,
}: {
    /** In the browser, with the tab's draft read. */
    ready: boolean;
    needsName: boolean;
    form: UseFormReturn<SetupValues>;
}) {
    const { step, moves, go, back } = useSetupStep();
    const formRef = useRef<HTMLFormElement>(null);
    const headingRef = useRef<HTMLHeadingElement>(null);
    /** The next change of step goes to a field in error, not the heading. */
    const toProblem = useRef(false);

    useLayoutEffect(() => {
        if (!ready) return;
        const open = openStep(step, form.getValues(), needsName);
        if (open === step) return;
        if (moves > 0) {
            toProblem.current = true;
            void form.trigger([...fieldsOf(open)]);
        }
        go(open, "replace");
    }, [ready, step, moves, needsName, form, go]);

    const shown = useRef<SetupStepId | null>(null);
    /** The step on show now, for work that outlives a render. */
    const current = useRef(step);
    useEffect(() => {
        current.current = step;
        if (!ready) return;
        // About to give way to an earlier step: it was never shown.
        if (openStep(step, form.getValues(), needsName) !== step) return;
        const from = shown.current;
        shown.current = step;
        if (toProblem.current) {
            toProblem.current = false;
            toFirstErrorIn(formRef.current);
        } else if (from !== null && from !== step) {
            // The browser brings it into view: a short step after a long
            // one must not open scrolled past its question.
            headingRef.current?.focus();
        }
    }, [step, ready, needsName, form]);

    /** Show the step a problem is on, with the keyboard on the problem. */
    function showProblemOn(to: SetupStepId) {
        if (to === step) {
            toFirstErrorIn(formRef.current);
            return;
        }
        toProblem.current = true;
        if (stepBefore(step) === to) back(to);
        else go(to, "replace");
    }

    return {
        step,
        /** Reached from another step: it arrives with the entrance. */
        moved: moves > 0,
        formRef,
        headingRef,
        current,
        go,
        back,
        showProblemOn,
    };
}
