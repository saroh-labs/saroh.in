"use client";

import { Checkbox } from "@saroh/ui/checkbox";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { useId, useState } from "react";

import { chipClass } from "@/components/shared/chip";
import { FormDialog, FormDialogFoot } from "@/components/shared/form-dialog";
import type { PauseOption } from "@/lib/subscriptions/pause";
import { DEFAULT_PAUSE } from "@/lib/subscriptions/pause";
import type { Plan } from "@/lib/subscriptions/service";
import { money } from "@/lib/subscriptions/view";

export type Step = "pause" | "switch" | "cancel";

const TITLE: Record<Step, string> = {
    pause: "Pause subscription",
    switch: "Change plan",
    cancel: "Cancel subscription",
};

/** The one sentence under each title: what the step changes. */
const SAYS: Record<Step, string> = {
    pause: "Renewals stop for as long as you choose.",
    switch: "Their next renewal moves to the plan you pick.",
    cancel: "Choose when it ends.",
};

const PER = { WEEK: "week", MONTH: "month", QUARTER: "quarter", YEAR: "year" };

/** What the choice made will do, said under it as it changes. */
const NOTE =
    "mt-2.5 text-pretty text-[12.5px] leading-[1.5] text-foreground/75";

/**
 * The three steps Subscription Detail asks about before it acts: one
 * choice each, so the app's one dialog (`FormDialog`). Pause and Change
 * plan are one API call the screen then offers to Undo. Cancel tells the
 * customer, so it waits ten seconds with Undo before anything is written.
 */
export function ActionDialog({
    step,
    onClose,
    busy,
    pauseOptions,
    pauseNote,
    plans,
    currentPlanId,
    switchNote,
    onPause,
    onSwitch,
    cancel,
    onCancel,
}: {
    step: Step | null;
    onClose: () => void;
    busy: boolean;
    /** 2, 4 or 8 weeks, and "Until I resume" (D8). */
    pauseOptions: readonly PauseOption[];
    pauseNote: (option: PauseOption | undefined) => string;
    plans: readonly Plan[];
    currentPlanId: string;
    switchNote: string;
    onPause: (option: PauseOption) => void;
    onSwitch: (planId: string) => void;
    cancel: {
        /** Ends with the period (Undo keeps it), or only today is possible. */
        canWaitForPeriodEnd: boolean;
        periodEndText: string;
        /** The unpaid charge a failed renewal could void too. */
        unpaid: { id: string; label: string } | null;
        failed: boolean;
    };
    onCancel: (when: "now" | "periodEnd", voidInvoiceId?: string) => void;
}) {
    return (
        <FormDialog
            open={step !== null}
            size="md"
            title={step ? TITLE[step] : ""}
            description={step ? SAYS[step] : ""}
            pending={busy}
            onClose={onClose}
        >
            {step ? (
                <>
                    {step === "pause" ? (
                        <PauseBody
                            options={pauseOptions}
                            note={pauseNote}
                            onPause={onPause}
                        />
                    ) : step === "switch" ? (
                        <SwitchBody
                            plans={plans}
                            currentPlanId={currentPlanId}
                            note={switchNote}
                            onSwitch={onSwitch}
                        />
                    ) : (
                        <CancelBody {...cancel} onCancel={onCancel} />
                    )}
                </>
            ) : null}
        </FormDialog>
    );
}

/**
 * How long: 2, 4 or 8 weeks, each saying the day it restarts on its own,
 * or until someone resumes it (D8). The design's pills, 4 weeks picked.
 */
function PauseBody({
    options,
    note,
    onPause,
}: {
    options: readonly PauseOption[];
    note: (option: PauseOption | undefined) => string;
    onPause: (option: PauseOption) => void;
}) {
    const [key, setKey] = useState(DEFAULT_PAUSE);
    const picked = options.find((o) => o.key === key) ?? options[0];
    return (
        <>
            <div
                role="radiogroup"
                aria-label="How long to pause"
                className="flex flex-wrap gap-1.5"
            >
                {options.map((o) => {
                    const on = o.key === picked.key;
                    return (
                        <button
                            key={o.key}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setKey(o.key)}
                            className={chipClass(on)}
                        >
                            {o.label}
                        </button>
                    );
                })}
            </div>
            <p role="status" className={NOTE}>
                {note(picked)}
            </p>
            <FormDialogFoot
                saveLabel="Pause subscription"
                savingLabel="Pausing…"
                onSubmit={() => onPause(picked)}
            />
        </>
    );
}

function SwitchBody({
    plans,
    currentPlanId,
    note,
    onSwitch,
}: {
    plans: readonly Plan[];
    currentPlanId: string;
    note: string;
    onSwitch: (planId: string) => void;
}) {
    const [picked, setPicked] = useState<string | null>(null);
    const [tried, setTried] = useState(false);
    // Archived plans take no one new, so they are not offered.
    const offered = plans.filter(
        (p) => p.status === "ACTIVE" && p.id !== currentPlanId,
    );
    return (
        <>
            {offered.length ? (
                <div
                    role="radiogroup"
                    aria-label="Plan to move to"
                    className="flex flex-col gap-1.5"
                >
                    {offered.map((p) => {
                        const on = picked === p.id;
                        return (
                            <button
                                key={p.id}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => setPicked(p.id)}
                                className={cn(
                                    "flex w-full rounded-[9px] px-3 py-2.5 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11",
                                    on
                                        ? "border-[1.5px] border-foreground bg-muted/50 font-semibold"
                                        : "border border-border bg-card font-medium hover:border-border-strong active:bg-accent-active",
                                )}
                            >
                                {p.name} · {money(p.price, p.currency)}/
                                {PER[p.interval]}
                            </button>
                        );
                    })}
                </div>
            ) : (
                <p className="text-[13px] text-foreground/75">
                    There is no other plan on sale to move to. Add one in Plans
                    first.
                </p>
            )}
            <p className={NOTE}>{note}</p>
            {tried && !picked && offered.length ? (
                <p
                    role="alert"
                    className="mt-2 text-[12.5px] font-medium text-destructive-subtle-foreground"
                >
                    Pick the plan to move to.
                </p>
            ) : null}
            {offered.length ? (
                <FormDialogFoot
                    saveLabel="Change from next renewal"
                    savingLabel="Changing…"
                    onSubmit={() => {
                        setTried(true);
                        if (picked) onSwitch(picked);
                    }}
                />
            ) : (
                <FormDialogFoot doneOnly doneLabel="Close" />
            )}
        </>
    );
}

function CancelBody({
    canWaitForPeriodEnd,
    periodEndText,
    unpaid,
    failed,
    onCancel,
}: {
    canWaitForPeriodEnd: boolean;
    periodEndText: string;
    unpaid: { id: string; label: string } | null;
    failed: boolean;
    onCancel: (when: "now" | "periodEnd", voidInvoiceId?: string) => void;
}) {
    const voidId = useId();
    const [when, setWhen] = useState<"now" | "periodEnd">(
        canWaitForPeriodEnd && !failed ? "periodEnd" : "now",
    );
    const [voidToo, setVoidToo] = useState(false);
    const note =
        when === "periodEnd"
            ? `Ends on ${periodEndText}. Nothing more is charged; what's paid for still happens.`
            : failed
              ? "Nothing more is charged, and it ends today. Restarting makes a new subscription. This cannot be undone."
              : "It ends today and nothing more is charged. Restarting makes a new subscription. This cannot be undone.";
    const options: { value: "now" | "periodEnd"; label: string }[] = [
        ...(canWaitForPeriodEnd
            ? [
                  {
                      value: "periodEnd" as const,
                      label: `At the end of this period · ${periodEndText}`,
                  },
              ]
            : []),
        { value: "now", label: "Today" },
    ];
    return (
        <>
            {options.length > 1 ? (
                <div
                    role="radiogroup"
                    aria-label="When it ends"
                    className="mb-2.5 flex flex-col gap-1.5"
                >
                    {options.map((o) => {
                        const on = when === o.value;
                        return (
                            <button
                                key={o.value}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => setWhen(o.value)}
                                className={cn(
                                    "flex w-full rounded-[9px] px-3 py-2.5 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11",
                                    on
                                        ? "border-[1.5px] border-foreground bg-muted/50 font-semibold"
                                        : "border border-border bg-card font-medium hover:border-border-strong active:bg-accent-active",
                                )}
                            >
                                {o.label}
                            </button>
                        );
                    })}
                </div>
            ) : null}
            <p role="status" className={cn(NOTE, "mt-0")}>
                {note}
            </p>
            {unpaid ? (
                <div className="mt-3 flex items-start gap-2.5">
                    <Checkbox
                        id={voidId}
                        checked={voidToo}
                        onCheckedChange={(c) => setVoidToo(c === true)}
                        className="mt-0.5"
                    />
                    <Label
                        htmlFor={voidId}
                        className="text-[13px] font-normal leading-[1.5]"
                    >
                        Void {unpaid.label} too
                        <span className="block text-[12px] text-muted-foreground">
                            Only if they shouldn&apos;t pay it. Left unticked,
                            it stays owed.
                        </span>
                    </Label>
                </div>
            ) : null}
            <FormDialogFoot
                tone="destructive"
                cancelLabel="Keep subscription"
                saveLabel="Cancel subscription"
                savingLabel="Cancelling…"
                onSubmit={() =>
                    onCancel(when, voidToo && unpaid ? unpaid.id : undefined)
                }
            />
        </>
    );
}
