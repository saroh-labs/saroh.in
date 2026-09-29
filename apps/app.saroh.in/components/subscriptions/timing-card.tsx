import { cn } from "@saroh/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import { useId } from "react";

import type {
    AutopayTimingSettings,
    TimingOption,
} from "@/lib/subscriptions/autopay-timing";
import {
    timelineText,
    timingTimeline,
} from "@/lib/subscriptions/autopay-timing";

/**
 * One "When autopay charges" choice as a radio card (D13B): its title, one
 * line on what it means, and a small timeline for a sample renewal. A
 * native radio underneath, so arrow keys move between cards and a screen
 * reader hears the title, the line and the timeline.
 */
export function TimingCard({
    name,
    option,
    renewal,
    settings,
    checked,
    disabled,
    onPick,
}: {
    name: string;
    option: TimingOption;
    /** The sample renewal day ("2026-10-06"). */
    renewal: string;
    settings: Pick<AutopayTimingSettings, "leadDays" | "dueDays">;
    checked: boolean;
    disabled: boolean;
    onPick: () => void;
}) {
    const id = useId();
    const steps = timingTimeline(option.value, renewal, settings);
    return (
        <label
            className={cn(
                "group relative flex min-w-0 flex-col gap-1 rounded-[10px] border px-3 py-2.5 transition-colors",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
                checked ? "border-brand bg-brand/5" : "border-border bg-card",
                disabled
                    ? "cursor-default opacity-80"
                    : "cursor-pointer hover:border-foreground/30 hover:bg-muted/50 active:bg-muted",
            )}
        >
            <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                disabled={disabled}
                onChange={onPick}
                aria-describedby={`${id}-line ${id}-when`}
                className="peer sr-only"
            />
            <span className="flex items-start gap-2">
                <span
                    aria-hidden
                    className={cn(
                        "mt-[3px] grid size-4 shrink-0 place-items-center rounded-full border",
                        checked ? "border-brand" : "border-foreground/40",
                    )}
                >
                    {checked ? (
                        <span className="size-2 rounded-full bg-brand" />
                    ) : null}
                </span>
                <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-foreground">
                    {option.title}
                    {option.isDefault ? (
                        <span className="ml-1.5 text-[11.5px] font-medium text-muted-foreground">
                            Default
                        </span>
                    ) : null}
                </span>
            </span>
            <span
                id={`${id}-line`}
                className="text-pretty pl-6 text-[12px] leading-[1.45] text-muted-foreground"
            >
                {option.consequence}
            </span>
            <span id={`${id}-when`} className="sr-only">
                {`For example: ${timelineText(steps)}.`}
            </span>
            <ol
                aria-hidden
                className="ml-6 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] tabular-nums"
            >
                {steps.map((step, i) => (
                    <li key={step.what} className="flex items-center gap-1.5">
                        {i > 0 ? (
                            <ArrowRight className="size-3 text-muted-foreground" />
                        ) : null}
                        <span className="rounded-[6px] bg-muted px-1.5 py-0.5 text-foreground/80">
                            {step.what} {step.day}
                            {step.note ? (
                                <span className="text-muted-foreground">
                                    {" "}
                                    ({step.note})
                                </span>
                            ) : null}
                        </span>
                    </li>
                ))}
            </ol>
        </label>
    );
}
