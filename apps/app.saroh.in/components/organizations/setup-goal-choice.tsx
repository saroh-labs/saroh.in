"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Check } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useRef } from "react";

import { GOAL_LATER } from "@/lib/modules/goals";
import type { SetupGoal } from "@/lib/organizations/setup-plan";

/**
 * "What will you do first?" on the setup screen (UX audit, 10 Oct): the
 * starting goals as radio cards, one chosen, in the same words Home and the
 * module picker use (`lib/modules/goals.ts`). Each card says what "Create"
 * opens. The last answer is for someone who would rather look around first.
 *
 * A real radio group for the keyboard: one tab stop, and the arrow keys
 * move and choose, as a native one would.
 */
export function SetupGoalChoice({
    goals,
    value,
    onChange,
    labelledBy,
    describedBy,
}: {
    goals: readonly SetupGoal[];
    value: string;
    onChange: (goal: string) => void;
    labelledBy: string;
    describedBy?: string;
}) {
    const cards = useRef<(HTMLButtonElement | null)[]>([]);
    const choices = [
        ...goals.map((g) => ({
            key: g.key,
            title: g.verb,
            note: g.note,
            lands: g.lands,
        })),
        {
            key: GOAL_LATER,
            title: "Decide later",
            note: "Look around first.",
            lands: "Opens Home.",
        },
    ];
    const current = choices.findIndex((c) => c.key === value);

    function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, at: number) {
        const step =
            event.key === "ArrowDown" || event.key === "ArrowRight"
                ? 1
                : event.key === "ArrowUp" || event.key === "ArrowLeft"
                  ? -1
                  : 0;
        if (step === 0) return;
        event.preventDefault();
        const next = (at + step + choices.length) % choices.length;
        onChange(choices[next].key);
        cards.current[next]?.focus();
    }

    return (
        <div
            role="radiogroup"
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            className="grid gap-2"
        >
            {choices.map((choice, at) => {
                const on = choice.key === value;
                return (
                    <button
                        key={choice.key}
                        ref={(el) => {
                            cards.current[at] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        data-goal={choice.key}
                        tabIndex={on || (current === -1 && at === 0) ? 0 : -1}
                        onClick={() => onChange(choice.key)}
                        onKeyDown={(e) => onKeyDown(e, at)}
                        className={cn(
                            "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            on
                                ? "border-foreground bg-muted"
                                : "border-input hover:bg-muted active:bg-accent-active",
                        )}
                    >
                        <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-semibold">
                                {choice.title}
                            </span>
                            <span className="mt-0.5 block text-pretty text-[12px] leading-snug text-muted-foreground">
                                {choice.note}
                                {on ? ` ${choice.lands}` : null}
                            </span>
                        </span>
                        <span
                            aria-hidden
                            className={cn(
                                "flex size-5 shrink-0 items-center justify-center rounded-full border",
                                on
                                    ? "border-foreground bg-foreground text-background"
                                    : "border-input",
                            )}
                        >
                            {on ? <Check className="size-3" /> : null}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
