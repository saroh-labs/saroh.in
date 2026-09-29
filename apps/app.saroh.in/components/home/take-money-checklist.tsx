"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showUndo } from "@saroh/ui/toast";
import { Check } from "lucide-react";
import Link from "next/link";
import { useId, useSyncExternalStore } from "react";

import type { ReadyChecklist, ReadyStep } from "@/lib/settings/ready";
import {
    SETUP_HIDDEN_KEY,
    readSetupHidden,
    takeMoneyPlace,
    writeSetupHidden,
} from "@/lib/settings/ready";

/**
 * "Get ready to take money" on Home ("Saroh Home" design, F8): the same steps
 * Settings › Business lists, each with why it matters and a link to where it
 * is done.
 *
 * Home renders this twice — `slot="first"` above Needs you and `slot="late"`
 * at the foot of the column — and each draws only when the checklist belongs
 * there: first while fewer than half the steps are done, at the foot once
 * more are. Hidden, the foot keeps a "Show setup" link. Once every step is
 * done neither draws anything.
 *
 * Hide is per person, per business, in this browser (default 123). Both
 * slots read one store so hiding in one moves the other at once; a browser
 * that won't store it still hides it for this visit.
 */

type Slot = "first" | "late";

const HIDE_EVENT = "saroh:setup-hidden";
/** This visit's choice, for a browser whose storage refused it. */
const remembered = new Map<string, boolean>();

const storage = () => window.localStorage;

function subscribe(onChange: () => void) {
    const onStorage = (e: StorageEvent) => {
        if (e.key === SETUP_HIDDEN_KEY) onChange();
    };
    window.addEventListener(HIDE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
        window.removeEventListener(HIDE_EVENT, onChange);
        window.removeEventListener("storage", onStorage);
    };
}

function isHidden(businessId: string) {
    return remembered.get(businessId) ?? readSetupHidden(storage, businessId);
}

function setHidden(businessId: string, hidden: boolean) {
    if (writeSetupHidden(storage, businessId, hidden)) {
        remembered.delete(businessId);
    } else {
        remembered.set(businessId, hidden);
    }
    window.dispatchEvent(new Event(HIDE_EVENT));
}

export function TakeMoneyChecklist({
    list,
    businessId,
    slot,
}: {
    list: ReadyChecklist;
    businessId: string;
    slot: Slot;
}) {
    const headingId = useId();
    // The server can't see the browser's storage, so it draws the checklist
    // shown; a hidden one steps aside right after hydration.
    const hidden = useSyncExternalStore(
        subscribe,
        () => isHidden(businessId),
        () => false,
    );
    const place = takeMoneyPlace(list, hidden);
    const count = `${list.done} of ${list.total} done`;

    if (place === "hidden") {
        if (slot !== "late") return null;
        return (
            <button
                type="button"
                onClick={() => setHidden(businessId, false)}
                className="justify-self-start text-left text-[12.5px] font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-muted-foreground coarse:min-h-11"
            >
                Show setup ({count})
            </button>
        );
    }
    if (place !== slot) return null;

    const hide = () => {
        setHidden(businessId, true);
        showUndo("Setup hidden. Show it again from the bottom of Home.", () =>
            setHidden(businessId, false),
        );
    };

    // Leading, it is a business early in setup: every step shows, the done
    // ones ticked, under a bar of ticks. At the foot, only what is left.
    const steps =
        slot === "first" ? list.steps : list.steps.filter((s) => !s.done);

    return (
        <section
            aria-labelledby={headingId}
            className="grid gap-2.5 rounded-xl border border-border bg-card px-[18px] py-4"
        >
            <div className="flex flex-wrap items-baseline gap-2.5">
                <h2 id={headingId} className="text-[15px] font-semibold">
                    Get ready to take money
                </h2>
                <span className="text-[12.5px] text-muted-foreground">
                    {count}
                </span>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={hide}
                    className="ml-auto px-2.5 text-[12.5px] font-medium text-neutral-600 dark:text-neutral-400"
                >
                    Hide for now
                </Button>
            </div>
            {slot === "first" ? (
                <div
                    role="progressbar"
                    aria-label="Setup done"
                    aria-valuemin={0}
                    aria-valuemax={list.total}
                    aria-valuenow={list.done}
                    aria-valuetext={count}
                    className="flex gap-1"
                >
                    {list.steps.map((step, i) => (
                        <span
                            key={step.key}
                            className={cn(
                                "h-1 flex-1 rounded-sm",
                                i < list.done
                                    ? "bg-success-subtle-foreground"
                                    : "bg-muted",
                            )}
                        />
                    ))}
                </div>
            ) : null}
            <ul className="grid">
                {steps.map((step) => (
                    <li key={step.key}>
                        <StepRow step={step} />
                    </li>
                ))}
            </ul>
        </section>
    );
}

function StepRow({ step }: { step: ReadyStep }) {
    return (
        <Link
            href={step.href}
            className="flex items-start gap-[11px] rounded-[9px] px-2 py-[9px] text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <span
                aria-hidden
                className={cn(
                    "mt-px flex size-5 flex-none items-center justify-center rounded-md",
                    step.done
                        ? "border border-success-subtle-foreground bg-success-subtle-foreground text-card"
                        : step.broken
                          ? "border-[1.5px] border-destructive"
                          : "border-[1.5px] border-border-strong",
                )}
            >
                {step.done ? (
                    <Check className="size-3" strokeWidth={3} />
                ) : null}
            </span>
            <span className="grid min-w-0 gap-0.5">
                <span
                    className={cn(
                        "text-[14px] font-medium",
                        step.done && "text-muted-foreground line-through",
                    )}
                >
                    {step.label}
                    {step.done ? (
                        <span className="sr-only"> — done</span>
                    ) : null}
                </span>
                <span className="text-pretty text-[12.5px] leading-[1.45] text-muted-foreground">
                    {step.why}
                </span>
            </span>
        </Link>
    );
}
