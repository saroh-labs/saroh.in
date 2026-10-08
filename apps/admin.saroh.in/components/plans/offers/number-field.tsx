"use client";

import { cn } from "@saroh/ui/lib/utils";
import type { InputHTMLAttributes } from "react";
import { useEffect, useRef, useState } from "react";

import { paiseToRupees, rupeesToPaise } from "./money";

/**
 * Number fields that edit the shared draft (plans catalogue U9). The draft
 * takes only a value it can hold, so what is typed is kept as text and sent
 * on as soon as it is one; leaving the field puts it back in range ("13"
 * becomes 12), so a half-typed "1" on the way to "10" never lands as 6.
 */

const FIELD =
    "h-[30px] rounded-[7px] border border-border-strong bg-card px-2 text-[13px] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45 aria-[invalid=true]:border-destructive";

type Native = Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "min" | "max" | "type"
>;

/** Keeps typed text while focused; follows the value otherwise. */
function useTyped(shown: string) {
    const [text, setText] = useState(shown);
    const focusedRef = useRef(false);
    useEffect(() => {
        if (!focusedRef.current) setText(shown);
    }, [shown]);
    return { text, setText, focusedRef };
}

export function WholeField({
    value,
    min,
    max,
    onValue,
    className,
    ...rest
}: Native & {
    value: number;
    min: number;
    max?: number;
    onValue: (n: number) => void;
}) {
    const { text, setText, focusedRef } = useTyped(String(value));
    const top = max ?? Number.MAX_SAFE_INTEGER;
    return (
        <input
            {...rest}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={text}
            className={cn(FIELD, className)}
            onFocus={() => {
                focusedRef.current = true;
            }}
            onChange={(e) => {
                setText(e.target.value);
                const n = Number(e.target.value);
                if (
                    e.target.value !== "" &&
                    Number.isInteger(n) &&
                    n >= min &&
                    n <= top &&
                    n !== value
                ) {
                    onValue(n);
                }
            }}
            onBlur={() => {
                focusedRef.current = false;
                const n = Math.trunc(Number(text));
                const next = Number.isFinite(n) && text !== "" ? n : value;
                const clamped = Math.min(top, Math.max(min, next));
                if (clamped !== value) onValue(clamped);
                setText(String(clamped));
            }}
        />
    );
}

/** Rupees in, paise out; an amount that isn't one is put back on leaving. */
export function RupeesField({
    paise,
    onPaise,
    className,
    ...rest
}: Native & { paise: number; onPaise: (p: number) => void }) {
    const { text, setText, focusedRef } = useTyped(paiseToRupees(paise));
    return (
        <input
            {...rest}
            type="text"
            inputMode="decimal"
            value={text}
            className={cn(FIELD, className)}
            onFocus={() => {
                focusedRef.current = true;
            }}
            onChange={(e) => {
                setText(e.target.value);
                const p = rupeesToPaise(e.target.value);
                if (p !== null && p !== paise) onPaise(p);
            }}
            onBlur={() => {
                focusedRef.current = false;
                setText(paiseToRupees(rupeesToPaise(text) ?? paise));
            }}
        />
    );
}

export const fieldClass = FIELD;
