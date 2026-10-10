"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Check } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useRef } from "react";

import type { OrganizationKind } from "@/lib/organizations/kind";
import { KIND_CHOICES } from "@/lib/organizations/kind";

/**
 * "What are you setting up?" (DEC-070): three small radio cards, with
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
    const cards = useRef<(HTMLButtonElement | null)[]>([]);
    const current = KIND_CHOICES.findIndex((c) => c.kind === value);

    function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, at: number) {
        const step =
            event.key === "ArrowDown" || event.key === "ArrowRight"
                ? 1
                : event.key === "ArrowUp" || event.key === "ArrowLeft"
                  ? -1
                  : 0;
        if (step === 0) return;
        event.preventDefault();
        const next = (at + step + KIND_CHOICES.length) % KIND_CHOICES.length;
        onChange(KIND_CHOICES[next].kind);
        cards.current[next]?.focus();
    }

    return (
        <div
            role="radiogroup"
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            aria-invalid={invalid ? true : undefined}
            aria-required
            className="grid gap-2 sm:grid-cols-3"
        >
            {KIND_CHOICES.map((choice, at) => {
                const on = choice.kind === value;
                return (
                    <button
                        key={choice.kind}
                        ref={(el) => {
                            cards.current[at] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        // One tab stop: the chosen card, or the first before
                        // anything is chosen.
                        tabIndex={on || (current === -1 && at === 0) ? 0 : -1}
                        onClick={() => onChange(choice.kind)}
                        onKeyDown={(e) => onKeyDown(e, at)}
                        className={cn(
                            "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            on
                                ? "border-foreground bg-muted"
                                : cn(
                                      "hover:bg-muted active:bg-accent-active",
                                      invalid
                                          ? "border-destructive"
                                          : "border-input",
                                  ),
                        )}
                    >
                        <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold">
                                {choice.label}
                            </span>
                            <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
                                {choice.examples}
                            </span>
                        </span>
                        <span
                            aria-hidden
                            className={cn(
                                "flex size-4 shrink-0 items-center justify-center rounded-full border",
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
