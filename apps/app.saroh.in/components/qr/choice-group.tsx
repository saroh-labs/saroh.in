"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useRef } from "react";

/**
 * One-of-several, drawn however the caller likes (cards, pills, a segmented
 * bar, colour swatches): a radio group with one tab stop, where the arrows
 * move the choice, as `calendar/view-switch.tsx` does for two. A choice
 * that is off is skipped by the arrows and says so to a screen reader; the
 * caller says why nearby.
 */

export interface Choice<T extends string> {
    value: T;
    label: React.ReactNode;
    /** For a choice with no words of its own (a colour). */
    ariaLabel?: string;
    disabled?: boolean;
    style?: React.CSSProperties;
}

const STEP: Record<string, number> = {
    ArrowLeft: -1,
    ArrowUp: -1,
    ArrowRight: 1,
    ArrowDown: 1,
};

export function ChoiceGroup<T extends string>({
    labelledBy,
    label,
    choices,
    value,
    onChange,
    className,
    itemClassName,
}: {
    /** The id of the visible heading that names the group. */
    labelledBy?: string;
    label?: string;
    choices: readonly Choice<T>[];
    value: T | null;
    onChange: (value: T) => void;
    className?: string;
    itemClassName: (on: boolean, choice: Choice<T>) => string;
}) {
    const refs = useRef(new Map<T, HTMLButtonElement>());
    const usable = choices.filter((c) => !c.disabled);
    // One tab stop: the chosen one, else the first that can be chosen.
    const stop = usable.find((c) => c.value === value) ?? usable.at(0);

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const step = STEP[e.key];
        if (!step || usable.length === 0) return;
        e.preventDefault();
        const at = Math.max(
            0,
            usable.findIndex((c) => c.value === (stop?.value ?? null)),
        );
        const to = usable.at((at + step + usable.length) % usable.length);
        if (!to) return;
        refs.current.get(to.value)?.focus();
        if (to.value !== value) onChange(to.value);
    };

    return (
        <div
            role="radiogroup"
            aria-labelledby={labelledBy}
            aria-label={label}
            onKeyDown={onKeyDown}
            className={className}
        >
            {choices.map((choice) => {
                const on = choice.value === value;
                return (
                    <button
                        key={choice.value}
                        ref={(el) => {
                            if (el) refs.current.set(choice.value, el);
                            else refs.current.delete(choice.value);
                        }}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={choice.ariaLabel}
                        aria-disabled={choice.disabled ? true : undefined}
                        tabIndex={choice.value === stop?.value ? 0 : -1}
                        style={choice.style}
                        onClick={() => {
                            if (!choice.disabled && !on) onChange(choice.value);
                        }}
                        className={cn(
                            "transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            choice.disabled
                                ? "cursor-not-allowed"
                                : "cursor-pointer",
                            itemClassName(on, choice),
                        )}
                    >
                        {choice.label}
                    </button>
                );
            })}
        </div>
    );
}

/** The design's eyebrow: 11px Geist 600, uppercase at 0.1em. */
export function Eyebrow({
    id,
    className,
    children,
}: {
    id?: string;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <span
            id={id}
            className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground",
                className,
            )}
        >
            {children}
        </span>
    );
}

/** A pill choice (where it goes, the label): 34px, 13px 600, full round. */
export function pillClass(on: boolean, disabled = false): string {
    return cn(
        "h-[34px] rounded-full border-[1.5px] bg-card px-3 text-[13px] font-semibold text-foreground coarse:h-11",
        on ? "border-foreground" : "border-border",
        !on && !disabled && "hover:border-border-strong active:bg-muted",
    );
}
