"use client";

import type {
    LimitReachedStateProps,
    PlanLockedStateProps,
} from "@saroh/ui/data-state";
import { LimitReachedState, PlanLockedState } from "@saroh/ui/data-state";
import { WHO_CAN_CHANGE_PLAN } from "@saroh/ui/lib/state-copy";
import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import { plansShown } from "@/lib/saroh-billing/plans-shown";

/**
 * Whether the person reading may change the plan (`mayChangePlan`,
 * `lib/billing/plan-access.ts`), for every plan prompt in the app (UX
 * audit, 10 Oct 2026).
 *
 * A plan lock or a limit used to offer "See plans" to everyone, and Plan
 * and billing then turned most of them away. The shell says it once
 * (`PlanAccessProvider`), and a prompt wraps its link in `PlanWay`, or
 * passes `useCanChangePlan()` to `PlanLockedState` / `LimitReachedState`.
 * Someone who can't change the plan reads who can, as text.
 *
 * Outside the shell (the site editor) nobody has said, and the link shows:
 * the page it opens decides.
 *
 * While plans aren't shown (DEC-136, `plansShown`) none of this is drawn:
 * no link, no "who can", no plan card. There is no page for them to open.
 */
const PlanAccessContext = createContext(true);

export function PlanAccessProvider({
    canChangePlan,
    children,
}: {
    canChangePlan: boolean;
    children: ReactNode;
}) {
    return (
        <PlanAccessContext.Provider value={canChangePlan}>
            {children}
        </PlanAccessContext.Provider>
    );
}

/** Whether to offer the way to another plan. */
export function useCanChangePlan(): boolean {
    return useContext(PlanAccessContext);
}

/**
 * The way to another plan: the link or button passed in, for someone who
 * may change the plan. For anyone else, who can, as a line of text.
 * `fallback={null}` draws nothing where the sentence beside it already
 * says so.
 */
export function PlanWay({
    children,
    className,
    fallback,
    when = true,
}: {
    /** The link, as the prompt draws it for someone who can. */
    children: ReactNode;
    /**
     * For a link that is only sometimes the way to a plan (a fix that may
     * also be "Connect one in Providers"): `isPlanHref(href)`. False, the
     * link is drawn as given.
     */
    when?: boolean;
    /** The line's own type, where the prompt's differs. */
    className?: string;
    /** In place of the line. `null` for nothing. */
    fallback?: ReactNode;
}) {
    const can = useCanChangePlan();
    if (when && !plansShown()) return null;
    if (!when || can) return children;
    if (fallback !== undefined) return fallback;
    return (
        <span
            data-plan-who
            className={cn(
                "text-pretty text-[12.5px] leading-normal text-muted-foreground",
                className,
            )}
        >
            {WHO_CAN_CHANGE_PLAN}
        </span>
    );
}

/**
 * `PlanLockedState` for this reader: the plan link for someone who may
 * change the plan, who can for anyone else. A screen never passes
 * `canChangePlan` itself, so none can get it wrong.
 */
export function PlanLockedCard(
    props: Omit<PlanLockedStateProps, "canChangePlan">,
) {
    const canChangePlan = useCanChangePlan();
    if (!plansShown()) return null;
    return <PlanLockedState {...props} canChangePlan={canChangePlan} />;
}

/** `LimitReachedState` for this reader, the same way. */
export function LimitReachedCard(
    props: Omit<LimitReachedStateProps, "canChangePlan">,
) {
    const canChangePlan = useCanChangePlan();
    if (!plansShown()) return null;
    return <LimitReachedState {...props} canChangePlan={canChangePlan} />;
}
