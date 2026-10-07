"use client";

import { focusRing, inputFill } from "../booking-flow/styles";
import { cn } from "../lib/utils";
import type { CheckoutQuote } from "./api";

/**
 * The bag's discount code (DEC-104): a code typed, tidied and applied, and
 * judged by the shop's server with the counter's rules every time the bag
 * is priced. Nothing here decides what a code takes off.
 */

const field = cn(
    "border-site-border text-site-fg block h-11 w-full min-w-0 flex-1 rounded-[calc(var(--site-radius)+8px)] border px-3 text-[15px] uppercase",
    inputFill,
    focusRing,
);

/**
 * A typed code tidied as the shop stores codes — trimmed, upper case — or
 * null when it can't be one (empty, too long, or with a character no code
 * has), so it is never sent.
 */
export function cleanCode(raw: string): string | null {
    const code = raw.trim().toUpperCase();
    return /^[A-Z0-9_-]{1,32}$/.test(code) ? code : null;
}

/**
 * Whether the quote on screen has judged the code applied in the bag yet:
 * until it has, its total isn't the one the customer would pay.
 */
export function codeSettled(
    quote: CheckoutQuote | null,
    code: string | null,
): boolean {
    if (!quote) return false;
    // An API from before site codes never judges one: nothing to wait for,
    // and nothing is taken off or sent.
    if (quote.discount === undefined) return true;
    return (quote.discount?.code ?? null) === code;
}

/**
 * "Have a code?" (DEC-104): a link until asked for, then the field and
 * Apply. The shop's answer comes back with the quote — the discount line
 * above the total, or the reason under the field.
 */
export function CodeField({
    site,
    open,
    onOpen,
    value,
    onChange,
    onApply,
    checking,
    applied,
    note,
}: {
    site: string;
    open: boolean;
    onOpen: () => void;
    value: string;
    onChange: (value: string) => void;
    onApply: () => void;
    checking: boolean;
    applied: string | null;
    note: string | null;
}) {
    if (!open) {
        return (
            <button
                type="button"
                onClick={onOpen}
                className={cn(
                    "text-site-fg mt-2.5 cursor-pointer text-[13.5px] font-semibold underline",
                    focusRing,
                )}
            >
                Have a code?
            </button>
        );
    }
    const id = `${site}-code`;
    return (
        <form
            className="mt-2.5"
            onSubmit={(e) => {
                e.preventDefault();
                onApply();
            }}
        >
            <label htmlFor={id} className="block text-[13.5px] font-medium">
                Discount code
            </label>
            <span className="mt-1 flex gap-2">
                <input
                    id={id}
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={32}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    aria-invalid={note ? true : undefined}
                    aria-describedby={note ? `${id}-note` : undefined}
                    className={field}
                />
                <button
                    type="submit"
                    disabled={checking}
                    className={cn(
                        "border-site-border text-site-fg h-11 shrink-0 cursor-pointer rounded-[calc(var(--site-radius)+8px)] border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60",
                        focusRing,
                    )}
                >
                    {checking ? "Checking…" : "Apply"}
                </button>
            </span>
            {note ? (
                <p
                    id={`${id}-note`}
                    role="alert"
                    className="text-site-fg mt-1.5 text-[12.5px] font-semibold"
                >
                    {note}
                </p>
            ) : applied ? (
                <p
                    role="status"
                    className="text-site-muted mt-1.5 text-[12.5px]"
                >
                    {applied} applied.
                </p>
            ) : null}
        </form>
    );
}
