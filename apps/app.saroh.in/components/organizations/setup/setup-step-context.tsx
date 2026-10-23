"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

import type { SetupStepId } from "@/lib/organizations/setup-steps";
import {
    STEP_PARAM,
    stepFromQuery,
    stepHref,
} from "@/lib/organizations/setup-steps";

/**
 * Which of setup's steps is on screen, and the address that says so.
 *
 * The step lives in the address (`/onboarding?step=name`) and is pushed to
 * the browser's history, so the browser's own Back is the previous step and
 * a reload stays where it was. The form and the panel beside it both read
 * it from here: one step, two places that show it.
 *
 * The browser's history is written directly (`history.pushState`), which
 * Next's router follows without asking the server for the page again: the
 * page is the same one, only the question on it changes.
 */
interface SetupStepState {
    step: SetupStepId;
    /** How many times the step has changed since the page arrived. */
    moves: number;
    /** Show a step. A push by default: Continue makes a history entry. */
    go: (to: SetupStepId, how?: "push" | "replace") => void;
    /**
     * Go back to the step before. The browser's own Back when this step was
     * reached by Continue, so the history holds each step once. Otherwise
     * (a reload, a link straight to a later step) the address is swapped.
     */
    back: (to: SetupStepId) => void;
}

/** Set on a history entry Continue pushed: the entry behind it is the step before. */
const CAME_BY_CONTINUE = "sarohSetupContinue";

const SetupStepContext = createContext<SetupStepState | null>(null);

function stepInAddress(): SetupStepId {
    return stepFromQuery(
        new URLSearchParams(window.location.search).get(STEP_PARAM),
    );
}

export function SetupStepProvider({
    initial,
    children,
}: {
    /** The step the address asked for, as the server read it. */
    initial: SetupStepId;
    children: React.ReactNode;
}) {
    const [{ step, moves }, setAt] = useState({ step: initial, moves: 0 });
    const setStep = useCallback((to: SetupStepId) => {
        setAt((at) => ({ step: to, moves: at.moves + 1 }));
    }, []);

    // The browser's Back and Forward.
    useEffect(() => {
        const onPop = () => setStep(stepInAddress());
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, [setStep]);

    const go = useCallback<SetupStepState["go"]>(
        (to, how = "push") => {
            const href = stepHref(window.location.href, to);
            if (how === "push") {
                window.history.pushState(
                    { [CAME_BY_CONTINUE]: true },
                    "",
                    href,
                );
            } else {
                window.history.replaceState(null, "", href);
            }
            setStep(to);
        },
        [setStep],
    );

    const back = useCallback<SetupStepState["back"]>(
        (to) => {
            const state: unknown = window.history.state;
            const cameByContinue =
                typeof state === "object" &&
                state !== null &&
                CAME_BY_CONTINUE in state;
            if (cameByContinue) window.history.back();
            else go(to, "replace");
        },
        [go],
    );

    const value = useMemo(
        () => ({ step, moves, go, back }),
        [step, moves, go, back],
    );
    return (
        <SetupStepContext.Provider value={value}>
            {children}
        </SetupStepContext.Provider>
    );
}

export function useSetupStep(): SetupStepState {
    const state = useContext(SetupStepContext);
    if (!state) {
        throw new Error("useSetupStep needs a SetupStepProvider above it");
    }
    return state;
}
