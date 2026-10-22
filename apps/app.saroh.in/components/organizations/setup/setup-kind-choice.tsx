"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Check } from "lucide-react";

import { ChoiceGroup } from "@/components/shared/choice-group";
import type { OrganizationKind } from "@/lib/organizations/kind";
import { KIND_CHOICES } from "@/lib/organizations/kind";

/**
 * "What are you setting up?" (DEC-070): three full-width radio cards, one
 * to a row, as setup's first step (11 Oct 2026), with
 * DEC-070's examples under each. Setup opens with "A business" chosen
 * (owner, 10 Oct 2026): the answer is a default to change, not a gate.
 *
 * A real radio group for the keyboard: one tab stop, the arrow keys move
 * and choose, as a native one would. The label and any error are the
 * caller's (`labelledBy`, `describedBy`), so the form's own `FormLabel` and
 * `FormMessage` name it.
 */
export function SetupKindChoice({
    value,
    onChange,
    labelledBy,
    describedBy,
    invalid,
}: {
    value: OrganizationKind | undefined;
    onChange: (kind: OrganizationKind) => void;
    labelledBy: string;
    describedBy?: string;
    invalid?: boolean;
}) {
    return (
        <ChoiceGroup
            labelledBy={labelledBy}
            describedBy={describedBy}
            invalid={invalid}
            required
            className="grid gap-2.5"
            value={value ?? null}
            onChange={onChange}
            choices={KIND_CHOICES.map((choice) => {
                const on = choice.kind === value;
                return {
                    value: choice.kind,
                    label: (
                        <>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[14px] font-semibold">
                                    {choice.label}
                                </span>
                                <span className="mt-0.5 block text-pretty text-[12.5px] leading-snug text-muted-foreground">
                                    {choice.examples}
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
                    "flex min-h-[60px] items-center gap-3 rounded-lg border px-4 py-3 text-left focus-visible:ring-offset-0",
                    on
                        ? "border-foreground bg-muted"
                        : cn(
                              "hover:bg-muted active:bg-accent-active",
                              invalid ? "border-destructive" : "border-input",
                          ),
                )
            }
        />
    );
}
