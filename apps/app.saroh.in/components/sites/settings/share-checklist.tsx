"use client";

import { Card, CardContent } from "@saroh/ui/card";
import { Check, Circle } from "lucide-react";

import type { ShareStep, ShareStepKey } from "@/lib/sites/settings-page";
import { readinessCount } from "@/lib/sites/settings-page";

/** The verb on an unmet step. */
const VERB: Record<ShareStepKey, string> = {
    title: "Write",
    description: "Write",
    image: "Add",
    menu: "Build",
};

/**
 * "Before you share your site · 2 of 4" (Website › Settings audit, the
 * goal gradient told honestly): the steps that are true to ask for, from
 * what is already done. Each one not done jumps to its row and, where the
 * reader may change it, opens it: `onJump` switches to its tab first.
 *
 * A live site with every step done gets one quiet line instead: nothing is
 * asked of the owner, and the card would only push the settings down.
 */
export function ShareChecklist({
    steps,
    live,
    onJump,
    canEdit = false,
}: {
    steps: readonly ShareStep[];
    live: boolean;
    /** Opens the row for editing; absent for someone who can't change it. */
    onJump?: (step: ShareStep) => void;
    /** Whether the reader may change the rows: "Write" or just "Show". */
    canEdit?: boolean;
}) {
    const { done, of } = readinessCount(steps);
    if (live && done === of) {
        return (
            <p
                role="status"
                data-share-ready
                className="flex items-center gap-2 text-sm text-muted-foreground"
            >
                <Check aria-hidden className="size-4 shrink-0 text-success" />
                Ready to share: search, share image and menu are all set.
            </p>
        );
    }
    return (
        <Card className="wk-surface" data-share-checklist>
            <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-base font-semibold">
                        Before you share your site
                    </h2>
                    <span className="text-sm tabular-nums text-muted-foreground">
                        {done} of {of}
                    </span>
                </div>
                <div
                    role="progressbar"
                    aria-label="Ready to share"
                    aria-valuemin={0}
                    aria-valuemax={of}
                    aria-valuenow={done}
                    aria-valuetext={`${done} of ${of} done`}
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                >
                    <div
                        className="h-full rounded-full bg-highlight transition-[width] duration-slow"
                        style={{ width: `${of ? (done / of) * 100 : 0}%` }}
                    />
                </div>
                <ul className="space-y-1">
                    {steps.map((step) => (
                        <li
                            key={step.key}
                            data-step={step.key}
                            data-done={step.done ? "" : undefined}
                            className="flex min-h-9 items-center gap-2.5 text-sm"
                        >
                            {step.done ? (
                                <Check
                                    aria-hidden
                                    className="size-4 shrink-0 text-success"
                                />
                            ) : (
                                <Circle
                                    aria-hidden
                                    className="size-4 shrink-0 text-muted-foreground"
                                />
                            )}
                            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                                <span className="sr-only">
                                    {step.done ? "Done: " : "To do: "}
                                </span>
                                {step.label}
                                {step.done && step.note ? (
                                    <span className="text-muted-foreground">
                                        {" "}
                                        · {step.note}
                                    </span>
                                ) : null}
                            </span>
                            {step.done ? null : (
                                <a
                                    href={`#${step.anchor}`}
                                    onClick={(e) => {
                                        if (!onJump) return;
                                        e.preventDefault();
                                        onJump(step);
                                    }}
                                    className="shrink-0 rounded-sm px-1 py-1 font-medium underline underline-offset-2 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-foreground coarse:min-h-11 coarse:py-2.5"
                                >
                                    {canEdit ? VERB[step.key] : "Show"}
                                    <span className="sr-only">
                                        : {step.label}
                                    </span>
                                </a>
                            )}
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    );
}
