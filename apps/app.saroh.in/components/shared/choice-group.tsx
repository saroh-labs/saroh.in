"use client";

import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { RadioGroup, RadioGroupItem } from "@saroh/ui/radio-group";
import { Tip } from "@saroh/ui/tooltip";
import { useId, useRef } from "react";

import { chipClass } from "./chip";

/**
 * One of several, three ways. All three are a radio group to a screen
 * reader and a keyboard: one tab stop, and the arrows move the choice.
 *
 * - `ChipGroup`: a set of pills, for a short list of short names (a kind,
 *   a courier, a category). The look is `Chip`'s.
 * - `RadioCards`: rows with a radio dot, for choices that are a sentence
 *   or carry a note.
 * - `ChoiceGroup`: the same group drawn however the screen's design draws
 *   it (colour swatches, photo thumbnails, time buttons, a card with its
 *   own contents). Reach for it only when the first two can't draw it.
 *
 * A two- or three-way switch of view or mode is `Segmented`, not these.
 */

export interface Choice<T extends string> {
    value: T;
    label: React.ReactNode;
    /** For a choice with no words of its own (a colour). */
    ariaLabel?: string;
    /**
     * Off, with the reason nearby (or in `tip`). It says so to a screen
     * reader, a press does nothing and the arrows skip it.
     */
    disabled?: boolean;
    /** Shown on hover and focus: why it is off, or a swatch's name. */
    tip?: string;
    style?: React.CSSProperties;
    /** `data-*` attributes for the choice's button. */
    data?: Record<`data-${string}`, string>;
}

const STEP: Record<string, number> = {
    ArrowLeft: -1,
    ArrowUp: -1,
    ArrowRight: 1,
    ArrowDown: 1,
};

export interface ChoiceGroupProps<T extends string> {
    /** The id of the visible heading that names the group. */
    labelledBy?: string;
    label?: string;
    describedBy?: string;
    choices: readonly Choice<T>[];
    value: T | null;
    onChange: (value: T) => void;
    /** The whole group waits (a save is running, the role can't change it). */
    disabled?: boolean;
    invalid?: boolean;
    required?: boolean;
    className?: string;
    itemClassName: (on: boolean, choice: Choice<T>) => string;
    /**
     * Keep the keyboard where it is on a press (a toolbar over a text
     * editor, whose selection a focus change would drop).
     */
    keepFocus?: boolean;
    /**
     * A press on the chosen one is told to `onChange` too, for a choice
     * that a second press takes back (a heading style in a text editor).
     */
    reselect?: boolean;
    /**
     * For choices set out under headings of their own (times by day): the
     * caller lays the group out and calls `item(value)` where each choice
     * goes. The arrows still walk `choices` in order.
     */
    layout?: (item: (value: T) => React.ReactNode) => React.ReactNode;
}

export function ChoiceGroup<T extends string>({
    labelledBy,
    label,
    describedBy,
    choices,
    value,
    onChange,
    disabled = false,
    invalid = false,
    required = false,
    className,
    itemClassName,
    keepFocus = false,
    reselect = false,
    layout,
}: ChoiceGroupProps<T>) {
    const refs = useRef(new Map<T, HTMLButtonElement>());
    const usable = disabled ? [] : choices.filter((c) => !c.disabled);
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
            aria-label={labelledBy ? undefined : label}
            aria-describedby={describedBy}
            aria-invalid={invalid ? true : undefined}
            aria-required={required ? true : undefined}
            aria-disabled={disabled ? true : undefined}
            onKeyDown={onKeyDown}
            className={className}
        >
            {(layout
                ? (draw: (choice: Choice<T>) => React.ReactNode) =>
                      layout((v) => {
                          const choice = choices.find((c) => c.value === v);
                          return choice ? draw(choice) : null;
                      })
                : (draw: (choice: Choice<T>) => React.ReactNode) =>
                      choices.map(draw))((choice) => {
                const on = choice.value === value;
                const off = disabled || choice.disabled === true;
                const item = (
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
                        disabled={disabled}
                        tabIndex={choice.value === stop?.value ? 0 : -1}
                        style={choice.style}
                        {...choice.data}
                        onMouseDown={
                            keepFocus ? (e) => e.preventDefault() : undefined
                        }
                        onClick={() => {
                            if (!off && (!on || reselect)) {
                                onChange(choice.value);
                            }
                        }}
                        className={cn(
                            "transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            off ? "cursor-not-allowed" : "cursor-pointer",
                            itemClassName(on, choice),
                        )}
                    >
                        {choice.label}
                    </button>
                );
                return choice.tip ? (
                    <Tip key={choice.value} label={choice.tip}>
                        {item}
                    </Tip>
                ) : (
                    item
                );
            })}
        </div>
    );
}

/**
 * A set of pills, one chosen. The strip is as wide as its words and wraps
 * on a phone. `label` names it for a screen reader, or `labelledBy` points
 * at the visible label above it.
 */
export function ChipGroup<T extends string>({
    className,
    ...props
}: Omit<ChoiceGroupProps<T>, "itemClassName">) {
    return (
        <ChoiceGroup
            {...props}
            className={cn("flex min-w-0 flex-wrap gap-1.5", className)}
            itemClassName={(on, choice) =>
                chipClass(
                    on,
                    choice.disabled && !on
                        ? "border-border bg-disabled text-disabled-foreground hover:border-border hover:bg-disabled"
                        : undefined,
                )
            }
        />
    );
}

export interface RadioCard<T extends string> {
    value: T;
    /** The choice, in a few words or a sentence. */
    label: React.ReactNode;
    /** A quiet second line under it. */
    note?: React.ReactNode;
    /** At the far side of the row: an amount, a count. */
    aside?: React.ReactNode;
    disabled?: boolean;
}

/**
 * Choices that are a sentence: one row each, a radio dot then the words.
 * The whole row takes the press, the chosen row has an Ink edge, and each
 * row is 44px under a thumb. It is the shared `RadioGroup` underneath, so
 * the arrows move the choice and Tab passes through once.
 */
export function RadioCards<T extends string>({
    labelledBy,
    label,
    describedBy,
    options,
    value,
    onChange,
    disabled = false,
    invalid = false,
    className,
    rowClassName,
}: {
    labelledBy?: string;
    label?: string;
    describedBy?: string;
    options: readonly RadioCard<T>[];
    /** Null (or "") while nothing is chosen yet. */
    value: T | null;
    onChange: (value: T) => void;
    disabled?: boolean;
    invalid?: boolean;
    /** The rows' layout: `sm:grid-cols-2` for short choices side by side. */
    className?: string;
    rowClassName?: string;
}) {
    const id = useId();
    return (
        <RadioGroup
            aria-labelledby={labelledBy}
            aria-label={labelledBy ? undefined : label}
            aria-describedby={describedBy}
            aria-invalid={invalid ? true : undefined}
            value={value ?? ""}
            onValueChange={(v) => onChange(v as T)}
            disabled={disabled}
            className={cn("grid min-w-0 gap-2", className)}
        >
            {options.map((o) => {
                const off = disabled || o.disabled === true;
                return (
                    <Label
                        data-ph-mask=""
                        key={o.value}
                        htmlFor={`${id}-${o.value}`}
                        className={cn(
                            "flex min-w-0 items-center gap-2.5 rounded-[9px] border border-border bg-card px-3 py-2 text-[13px] font-medium leading-snug transition-colors duration-fast coarse:min-h-11",
                            "has-[[data-state=checked]]:border-foreground",
                            off
                                ? "cursor-not-allowed text-disabled-foreground"
                                : "cursor-pointer hover:bg-muted/60 active:bg-accent-active",
                            invalid && "border-destructive",
                            rowClassName,
                        )}
                    >
                        <RadioGroupItem
                            id={`${id}-${o.value}`}
                            value={o.value}
                            disabled={o.disabled}
                            className={o.note ? "mt-0.5 self-start" : undefined}
                        />
                        <span className="min-w-0 flex-1">
                            <span className="block">{o.label}</span>
                            {o.note ? (
                                <span className="mt-0.5 block text-[12px] font-normal text-muted-foreground">
                                    {o.note}
                                </span>
                            ) : null}
                        </span>
                        {o.aside ? (
                            <span className="shrink-0 font-normal tabular-nums text-muted-foreground">
                                {o.aside}
                            </span>
                        ) : null}
                    </Label>
                );
            })}
        </RadioGroup>
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
        <span id={id} className={cn("label", className)}>
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
