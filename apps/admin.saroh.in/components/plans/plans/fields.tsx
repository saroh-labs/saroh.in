"use client";

import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";
import { useId, useState } from "react";

/**
 * The Plans and Modules tabs' fields (plans catalogue U7, U8), drawn as the
 * design draws them: a small muted label over a dark field. Every field has
 * a visible label, says what's wrong beside itself (`aria-invalid` and
 * `aria-describedby`), and rings on keyboard focus.
 */

export const FIELD =
    "h-[34px] w-full min-w-0 rounded-[8px] border border-border-strong bg-field px-2.5 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive";

/** The row fields are a step smaller, as in the design. */
export const SMALL_FIELD = "h-8 px-[9px] text-[12.5px]";

export const SELECT =
    "cursor-pointer py-0 leading-normal hover:border-foreground/40 active:border-foreground/60";

export function Field({
    label,
    error,
    className,
    small,
    children,
}: {
    label: string;
    error?: string | null;
    className?: string;
    small?: boolean;
    children: (props: {
        id: string;
        "aria-invalid": boolean;
        "aria-describedby": string | undefined;
    }) => ReactNode;
}) {
    const id = useId();
    const errorId = `${id}-error`;
    return (
        <div className={cn("grid min-w-0 content-start gap-[5px]", className)}>
            <label
                htmlFor={id}
                className={cn(
                    "text-muted-foreground",
                    small ? "text-[11.5px]" : "text-[12px]",
                )}
            >
                {label}
            </label>
            {children({
                id,
                "aria-invalid": !!error,
                "aria-describedby": error ? errorId : undefined,
            })}
            {error && (
                <p id={errorId} className="text-[12px] text-destructive">
                    {error}
                </p>
            )}
        </div>
    );
}

/**
 * A number typed as text, with its label: what the operator types stays on
 * screen, and the draft only changes when it reads as a value. A refused
 * entry (`parse` gives undefined) says why beside the field and never
 * reaches the draft, so the draft is never saved with it.
 */
export function NumberField<T extends number | null>({
    label,
    value,
    format,
    parse,
    onCommit,
    hint,
    error,
    small,
    className,
    inputClassName,
    disabled,
    inputMode = "numeric",
}: {
    label: string;
    value: T;
    format: (value: T) => string;
    parse: (text: string) => T | undefined;
    onCommit: (value: T) => void;
    /** What the field says when it refuses an entry. */
    hint: string;
    /** The catalogue's own message for this field, if any. */
    error?: string | null;
    small?: boolean;
    className?: string;
    inputClassName?: string;
    disabled?: boolean;
    inputMode?: "numeric" | "decimal";
}) {
    const [text, setText] = useState(() => format(value));
    const refused = parse(text) === undefined;

    // The draft moved under us (another tab, Reload, a discard): show it,
    // unless what is typed already means the same thing. Adjusted while
    // rendering, so the old text never paints.
    const [shown, setShown] = useState(value);
    if (shown !== value) {
        setShown(value);
        if (parse(text) !== value) setText(format(value));
    }

    return (
        <Field
            label={label}
            error={refused ? hint : error}
            small={small}
            className={className}
        >
            {(a11y) => (
                <input
                    {...a11y}
                    type="text"
                    inputMode={inputMode}
                    autoComplete="off"
                    value={text}
                    disabled={disabled}
                    onChange={(e) => {
                        const next = e.target.value;
                        setText(next);
                        const v = parse(next);
                        if (v !== undefined && v !== value) onCommit(v);
                    }}
                    className={cn(FIELD, small && SMALL_FIELD, inputClassName)}
                />
            )}
        </Field>
    );
}
