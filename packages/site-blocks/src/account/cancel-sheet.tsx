"use client";

import { useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { cn } from "../lib/utils";
import type { AccountSubscription } from "./model";
import { accountDate } from "./model";
import type { PlanApi, PlanChangeResult } from "./plan-api";
import { PLAN_OFFLINE } from "./plan-api";
import { Sheet, sheetAltButton, sheetButton } from "./sheet";

/**
 * Cancel a plan from the account (round-2 plan A, A8; Saroh Customer Site
 * design, "Cancel your plan?"): at the end of the period, so the member
 * keeps what they paid for. When the business lets members pause, "Pause
 * instead" is offered first.
 */
export function CancelSheet({
    plan,
    canPauseInstead,
    onClose,
    cancel,
    onDone,
    onPauseInstead,
}: {
    /** The plan to cancel; the sheet is closed while null. */
    plan: AccountSubscription | null;
    canPauseInstead: boolean;
    onClose: () => void;
    cancel: PlanApi["cancel"];
    onDone: (result: Extract<PlanChangeResult, { ok: true }>) => void;
    onPauseInstead: () => void;
}) {
    const until = plan?.renewsAt ?? plan?.endsAt ?? null;
    const lead =
        plan?.status === "PAUSED"
            ? "It stops now, while it's paused. Nothing more is charged."
            : until
              ? `You keep everything until ${accountDate(until, plan?.timezone)}. Nothing more is charged.`
              : "You keep everything until the end of this period. Nothing more is charged.";

    return (
        <Sheet
            open={plan !== null}
            onClose={onClose}
            title="Cancel your plan?"
            lead={lead}
        >
            {plan ? (
                // Keyed, so each opening starts fresh.
                <CancelConfirm
                    key={plan.ref}
                    plan={plan}
                    canPauseInstead={canPauseInstead}
                    cancel={cancel}
                    onDone={onDone}
                    onPauseInstead={onPauseInstead}
                />
            ) : null}
        </Sheet>
    );
}

function CancelConfirm({
    plan,
    canPauseInstead,
    cancel,
    onDone,
    onPauseInstead,
}: {
    plan: AccountSubscription;
    canPauseInstead: boolean;
    cancel: PlanApi["cancel"];
    onDone: (result: Extract<PlanChangeResult, { ok: true }>) => void;
    onPauseInstead: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    async function submit() {
        if (busy) return;
        setBusy(true);
        setProblem(null);
        const result = await cancel(plan.ref).catch((): PlanChangeResult => ({
            ok: false,
            message: PLAN_OFFLINE,
        }));
        setBusy(false);
        if (result.ok) onDone(result);
        else setProblem(result.message);
    }

    return (
        <>
            {canPauseInstead ? (
                <p className="text-site-body mt-3 text-sm leading-normal">
                    Would a pause be better? You can pause instead and come back
                    any time.
                </p>
            ) : null}
            {problem ? (
                <p role="alert" className={cn(destructiveAlertClasses, "mt-3")}>
                    {problem}
                </p>
            ) : null}
            <button
                type="button"
                disabled={busy}
                onClick={() => void submit()}
                className={sheetButton(busy)}
            >
                {busy ? "Cancelling…" : "Cancel plan"}
            </button>
            {canPauseInstead ? (
                <button
                    type="button"
                    disabled={busy}
                    onClick={onPauseInstead}
                    className={sheetAltButton}
                >
                    Pause instead
                </button>
            ) : null}
        </>
    );
}
