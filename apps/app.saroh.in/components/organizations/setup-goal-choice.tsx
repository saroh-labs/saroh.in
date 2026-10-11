"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Check } from "lucide-react";

import { ChoiceGroup } from "@/components/shared/choice-group";
import { GOAL_LATER } from "@/lib/modules/goals";
import type { SetupGoal } from "@/lib/organizations/setup-plan";

/**
 * "What will you do first?", setup's last step (UX audit, 10 Oct): the
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

    return (
        <ChoiceGroup
            labelledBy={labelledBy}
            describedBy={describedBy}
            className="grid gap-2"
            value={choices.some((c) => c.key === value) ? value : null}
            onChange={onChange}
            choices={choices.map((choice) => {
                const on = choice.key === value;
                return {
                    value: choice.key,
                    data: { "data-goal": choice.key },
                    label: (
                        <>
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
                        </>
                    ),
                };
            })}
            itemClassName={(on) =>
                cn(
                    "flex min-h-[56px] items-center gap-3 rounded-lg border px-4 py-3 text-left focus-visible:ring-offset-0",
                    on
                        ? "border-foreground bg-muted"
                        : "border-input hover:bg-muted active:bg-accent-active",
                )
            }
        />
    );
}
