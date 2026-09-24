import { cn } from "@saroh/ui/lib/utils";

import { STAGE_LABEL, STEP_LABEL } from "@/lib/orders/lifecycle";
import type { KitchenStage } from "@/lib/orders/read";

import { FOCUS } from "./parts";

/**
 * Where the order is in the kitchen: small dots, no numbers, no button
 * borders (the design's audit flattened it), grouped and labelled as progress
 * for a screen reader — "Progress: Preparing, step 2 of 4".
 *
 * The step that comes next is a real button, drawn exactly like the others:
 * the header's primary button is the way most people move an order, and this
 * one means the stepper itself answers Tab and Enter, not only the pointer.
 */
export function KitchenStepper({
    flow,
    stage,
    refunded,
    next,
    busy,
    onAdvance,
}: {
    flow: KitchenStage[];
    stage: KitchenStage;
    /** Refunded in full: every step reads as done, none as current. */
    refunded: boolean;
    /** The step this person may take now, if any. */
    next: KitchenStage | null;
    /** A move is already in flight — disable the next step, like the header's own button. */
    busy: boolean;
    onAdvance: () => void;
}) {
    const at = flow.indexOf(stage);
    const label = refunded
        ? "Progress: refunded"
        : `Progress: ${STAGE_LABEL[stage]}, step ${at + 1} of ${flow.length}`;

    return (
        <div role="group" aria-label={label} className="px-0.5 pt-0.5">
            <ol className="flex flex-wrap items-center gap-2">
                {flow.map((s, i) => {
                    const done = i < at || refunded;
                    const now = i === at && !refunded;
                    const body = (
                        <>
                            <span
                                aria-hidden
                                className={cn(
                                    "size-2.5 shrink-0 rounded-full",
                                    done && "bg-foreground",
                                    now &&
                                        "bg-highlight ring-[3px] ring-brand-subtle",
                                    !done &&
                                        !now &&
                                        "border-[1.5px] border-border-strong",
                                )}
                            />
                            <span
                                className={cn(
                                    "whitespace-nowrap text-[12px]",
                                    now
                                        ? "font-bold text-foreground"
                                        : done
                                          ? "font-medium text-foreground"
                                          : "font-medium text-muted-foreground",
                                )}
                            >
                                {STAGE_LABEL[s]}
                            </span>
                        </>
                    );
                    return (
                        <li
                            key={s}
                            aria-current={now ? "step" : undefined}
                            className="contents"
                        >
                            {s === next ? (
                                <button
                                    type="button"
                                    onClick={onAdvance}
                                    disabled={busy}
                                    aria-label={`${STEP_LABEL[s]} — next step`}
                                    className={cn(
                                        FOCUS,
                                        "inline-flex items-center gap-[7px] rounded-md coarse:min-h-11",
                                    )}
                                >
                                    {body}
                                </button>
                            ) : (
                                <span className="inline-flex items-center gap-[7px]">
                                    {body}
                                </span>
                            )}
                            {i < flow.length - 1 ? (
                                <span
                                    aria-hidden
                                    className={cn(
                                        "h-0.5 min-w-3 flex-[1_1_12px]",
                                        i < at || refunded
                                            ? "bg-foreground"
                                            : "bg-border",
                                    )}
                                />
                            ) : null}
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
