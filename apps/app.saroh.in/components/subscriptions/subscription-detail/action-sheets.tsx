"use client";

import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { useId, useState } from "react";

import type { Plan } from "@/lib/subscriptions/service";
import { money } from "@/lib/subscriptions/view";

export type Step = "pause" | "switch" | "cancel";

const TITLE: Record<Step, string> = {
    pause: "Pause",
    switch: "Change plan",
    cancel: "Cancel subscription",
};

const PER = { WEEK: "week", MONTH: "month", QUARTER: "quarter", YEAR: "year" };

/** The footer buttons, at the design's 38px (44 on touch). */
const BTN = "h-[38px] rounded-[9px] px-4 text-[14px] font-semibold";

/**
 * The three steps Subscription Detail asks about before it acts, in the
 * design's centred sheet. Each one is a single API call the screen then
 * offers to Undo; Cancel "today" is the one that cannot be undone, and says
 * so.
 */
export function ActionSheet({
    step,
    onClose,
    busy,
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
    pauseNote: string;
    plans: readonly Plan[];
    currentPlanId: string;
    switchNote: string;
    onPause: () => void;
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
        <Dialog
            open={step !== null}
            onOpenChange={(o) => (!o ? onClose() : null)}
        >
            <DialogContent className="w-[calc(100%-40px)] max-w-[440px] gap-0 rounded-[14px] border-0 px-5 py-[18px] sm:rounded-[14px] [&>button:last-child]:hidden">
                {step ? (
                    <>
                        <DialogTitle className="mb-2.5 font-display text-[17px] font-semibold tracking-[-0.02em]">
                            {TITLE[step]}
                        </DialogTitle>
                        {step === "pause" ? (
                            <PauseBody
                                note={pauseNote}
                                busy={busy}
                                onClose={onClose}
                                onPause={onPause}
                            />
                        ) : step === "switch" ? (
                            <SwitchBody
                                plans={plans}
                                currentPlanId={currentPlanId}
                                note={switchNote}
                                busy={busy}
                                onClose={onClose}
                                onSwitch={onSwitch}
                            />
                        ) : (
                            <CancelBody
                                {...cancel}
                                busy={busy}
                                onClose={onClose}
                                onCancel={onCancel}
                            />
                        )}
                    </>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

function Footer({ children }: { children: React.ReactNode }) {
    return (
        <div className="mt-3.5 flex flex-wrap justify-end gap-2">
            {children}
        </div>
    );
}

function PauseBody({
    note,
    busy,
    onClose,
    onPause,
}: {
    note: string;
    busy: boolean;
    onClose: () => void;
    onPause: () => void;
}) {
    return (
        <>
            <DialogDescription className="text-pretty text-[12.5px] leading-[1.5] text-foreground/75">
                {note}
            </DialogDescription>
            <Footer>
                <Button variant="outline" className={BTN} onClick={onClose}>
                    Keep going
                </Button>
                <Button className={BTN} disabled={busy} onClick={onPause}>
                    {busy ? "Pausing…" : "Pause"}
                </Button>
            </Footer>
        </>
    );
}

function SwitchBody({
    plans,
    currentPlanId,
    note,
    busy,
    onClose,
    onSwitch,
}: {
    plans: readonly Plan[];
    currentPlanId: string;
    note: string;
    busy: boolean;
    onClose: () => void;
    onSwitch: (planId: string) => void;
}) {
    const [picked, setPicked] = useState<string | null>(null);
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
                                        : "border border-border bg-card font-medium hover:border-border-strong",
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
            <DialogDescription className="mt-2.5 text-pretty text-[12.5px] leading-[1.5] text-foreground/75">
                {note}
            </DialogDescription>
            <Footer>
                <Button variant="outline" className={BTN} onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    className={BTN}
                    disabled={!picked || busy}
                    onClick={() => (picked ? onSwitch(picked) : null)}
                >
                    Change from next renewal
                </Button>
            </Footer>
        </>
    );
}

function CancelBody({
    canWaitForPeriodEnd,
    periodEndText,
    unpaid,
    failed,
    busy,
    onClose,
    onCancel,
}: {
    canWaitForPeriodEnd: boolean;
    periodEndText: string;
    unpaid: { id: string; label: string } | null;
    failed: boolean;
    busy: boolean;
    onClose: () => void;
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
              ? "Nothing more is charged, and it ends today. This can't be undone — restarting makes a new subscription."
              : "It ends today and nothing more is charged. This can't be undone — restarting makes a new subscription.";
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
                                        : "border border-border bg-card font-medium hover:border-border-strong",
                                )}
                            >
                                {o.label}
                            </button>
                        );
                    })}
                </div>
            ) : null}
            <DialogDescription className="text-pretty text-[13px] leading-[1.55] text-foreground/75">
                {note}
            </DialogDescription>
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
            <Footer>
                <Button variant="outline" className={BTN} onClick={onClose}>
                    Keep it
                </Button>
                <Button
                    variant="destructive"
                    className={BTN}
                    disabled={busy}
                    onClick={() =>
                        onCancel(
                            when,
                            voidToo && unpaid ? unpaid.id : undefined,
                        )
                    }
                >
                    {busy ? "Cancelling…" : "Cancel subscription"}
                </Button>
            </Footer>
        </>
    );
}
