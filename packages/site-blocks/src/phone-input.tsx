"use client";

import type { PhoneParts } from "@saroh/block-contract";
import {
    countryFlag,
    joinPhone,
    PHONE_COUNTRIES,
    phoneCountry,
    splitPhone,
} from "@saroh/block-contract";
import { useState } from "react";

import { focusRing } from "./booking-flow/styles";
import { cn } from "./lib/utils";

/**
 * The merchant site's phone field (#1036): a country-code picker and the
 * number, on the site's own tokens. Never Saroh's brand: the workspace's
 * `PhoneInput` (`@saroh/ui/phone-input`) is the same field in Saroh's
 * look, and both read and write a number through `@saroh/block-contract`'s
 * phone rule, so a number means the same on the site, in the workspace and
 * at the API.
 *
 * - **The value is E.164 or ""**: "+919876543210". A number saved as it was
 *   typed ("98765 43210") is read the same way and left alone until changed.
 * - **The number stays as typed**; a whole number pasted ("+44 20 7946
 *   0958", "0091 98765 43210", "098765 43210") picks its country.
 * - **The picker is the browser's own list** under a drawn face (🇮🇳 +91):
 *   on a phone it is the phone's picker, and at a desk it answers the
 *   arrows, typing a country's name and Escape, with no script of ours.
 */
export function SitePhoneInput({
    id,
    value,
    onValueChange,
    defaultCountry,
    box,
    className,
    invalid = false,
    describedBy,
    disabled,
    required,
    name,
    placeholder,
    autoComplete = "tel-national",
}: {
    /** The number box's id, for its label. */
    id: string;
    value: string;
    onValueChange: (value: string) => void;
    /** ISO code of the business's country; India when not given. */
    defaultCountry?: string | null;
    /** The look of a box on this surface (its edge, height, radius, fill). */
    box: string;
    className?: string;
    invalid?: boolean;
    describedBy?: string;
    disabled?: boolean;
    required?: boolean;
    name?: string;
    placeholder?: string;
    autoComplete?: string;
}) {
    const [parts, setParts] = useState<PhoneParts>(() =>
        splitPhone(value, defaultCountry ?? undefined),
    );
    // A value from outside that this field didn't send (a reset, a saved
    // number arriving) is read into the box again.
    const [seen, setSeen] = useState(value);
    const [own, setOwn] = useState(value);
    if (value !== seen) {
        setSeen(value);
        if (value !== own) setParts(splitPhone(value, parts.country));
    }

    function change(next: PhoneParts) {
        setParts(next);
        const out = joinPhone(next);
        setOwn(out);
        if (out !== value) onValueChange(out);
    }

    const country = phoneCountry(parts.country);
    return (
        <div className={cn("flex min-w-0 gap-2", className)}>
            <div
                className={cn(
                    box,
                    "relative mt-0 flex w-auto shrink-0 items-center gap-1.5 px-3 tabular-nums",
                    "focus-within:ring-site-fg focus-within:ring-offset-site-bg focus-within:ring-2 focus-within:ring-offset-2",
                    disabled && "opacity-60",
                )}
            >
                <span aria-hidden className="text-base leading-none">
                    {countryFlag(country.code)}
                </span>
                <span aria-hidden>+{country.dial}</span>
                <svg
                    aria-hidden
                    viewBox="0 0 16 16"
                    className="text-site-muted size-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="m4 6 4 4 4-4" />
                </svg>
                <select
                    aria-label={`Country code: ${country.name} +${country.dial}`}
                    value={country.code}
                    disabled={disabled}
                    onChange={(e) =>
                        change({
                            country: e.target.value,
                            national: parts.national,
                        })
                    }
                    className="absolute inset-0 h-full w-full cursor-pointer appearance-none text-base opacity-0 disabled:cursor-default"
                >
                    {PHONE_COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                            {`${countryFlag(c.code)} ${c.name} +${c.dial}`}
                        </option>
                    ))}
                </select>
            </div>
            <input
                id={id}
                name={name}
                type="tel"
                inputMode="tel"
                autoComplete={autoComplete}
                placeholder={placeholder}
                required={required}
                disabled={disabled}
                value={parts.national}
                onChange={(e) =>
                    change({ country: parts.country, national: e.target.value })
                }
                onPaste={(e) => {
                    const el = e.currentTarget;
                    const whole =
                        el.value === "" ||
                        (el.selectionStart === 0 &&
                            el.selectionEnd === el.value.length);
                    if (!whole) return;
                    e.preventDefault();
                    change(
                        splitPhone(
                            e.clipboardData.getData("text"),
                            parts.country,
                        ),
                    );
                }}
                onBlur={() => {
                    // A number typed with its own + or 00: the code moves to
                    // the picker once the box is left.
                    if (/^\s*(?:\+|00)/.test(parts.national)) {
                        change(splitPhone(parts.national, parts.country));
                    }
                }}
                aria-invalid={invalid ? true : undefined}
                aria-describedby={describedBy}
                className={cn(
                    box,
                    "mt-0 min-w-0 flex-1 tabular-nums",
                    focusRing,
                )}
            />
        </div>
    );
}
