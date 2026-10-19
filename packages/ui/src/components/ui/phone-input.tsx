"use client";

import type { PhoneParts } from "@saroh/block-contract";
import {
    countryFlag,
    joinPhone,
    phoneCountry,
    searchCountries,
    splitPhone,
} from "@saroh/block-contract";
import { Check, ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/utils";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "./command";
import type { InputProps } from "./input";
import { fieldFocus, fieldStates, Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/**
 * The one phone field (#1036): a country-code picker (🇮🇳 +91 ▾) and the
 * number.
 *
 * - **The value is E.164 or ""**: "+919876543210", as the API keeps it. A
 *   value saved before numbers were checked ("98765 43210") is read the same
 *   way and shown in the box; nothing is sent until the number is changed.
 * - **The number stays as typed**, spaces and all. Only the value is compact.
 * - **A pasted whole number picks its country**: "+44 20 7946 0958",
 *   "0091 98765 43210", "919876543210" and "098765 43210" each set the code
 *   and leave the rest in the box. So does a number typed with its own `+`,
 *   once the box is left.
 * - **The country** starts as `defaultCountry` (the business's), else India,
 *   and is a searchable list: type a name, a code or "+44"; the arrows move,
 *   Enter picks, Escape closes.
 *
 * What is wrong with a number is the caller's to say, in `Field`'s error
 * (`phoneNumberProblem` from `@saroh/block-contract` is the API's rule). Put
 * it in a `Field` as its only child: the label, `id`, `aria-describedby` and
 * `aria-invalid` reach the number box.
 *
 * ```tsx
 * <Field label="Phone" error={problem}>
 *     <PhoneInput value={phone} onValueChange={setPhone} defaultCountry="IN" />
 * </Field>
 * ```
 */
export interface PhoneInputProps extends Omit<
    InputProps,
    "value" | "defaultValue" | "onChange" | "type" | "inputMode"
> {
    /** E.164 ("+919876543210"), "", or a number saved as it was typed. */
    value: string;
    onValueChange: (value: string) => void;
    /** ISO code of the business's country ("IN"); India when not given. */
    defaultCountry?: string | null;
    /** The picker's name for a screen reader. */
    countryLabel?: string;
    /** Placed on the field as a whole (its margin, its width). */
    className?: string;
    /**
     * The look of both boxes, where a surface draws its fields its own way
     * (saroh.in's 46px fields): the picker and the number still join.
     */
    boxClassName?: string;
}

/** Whether the box holds a number with its own country code in front. */
const HAS_CODE = /^\s*(?:\+|00)/;

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
    (
        {
            value,
            onValueChange,
            defaultCountry,
            countryLabel = "Country code",
            disabled,
            readOnly,
            className,
            boxClassName,
            onBlur,
            onPaste,
            autoComplete = "tel-national",
            ...props
        },
        ref,
    ) => {
        const [parts, setParts] = React.useState<PhoneParts>(() =>
            splitPhone(value, defaultCountry ?? undefined),
        );
        // The value last seen, and the one this field last sent: a value
        // from outside that is neither (a reset, a saved record arriving) is
        // read into the box again.
        const [seen, setSeen] = React.useState(value);
        const [own, setOwn] = React.useState(value);
        if (value !== seen) {
            setSeen(value);
            if (value !== own) setParts(splitPhone(value, parts.country));
        }

        const numberRef = React.useRef<HTMLInputElement | null>(null);
        // The caller's ref (a form library's, to focus the field) is the
        // number box's, as this field's own is.
        const numberBox = React.useCallback(
            (el: HTMLInputElement | null) => {
                numberRef.current = el;
                if (typeof ref === "function") ref(el);
                else if (ref) ref.current = el;
            },
            [ref],
        );

        function change(next: PhoneParts) {
            setParts(next);
            const out = joinPhone(next);
            setOwn(out);
            if (out !== value) onValueChange(out);
        }

        const country = phoneCountry(parts.country);
        const [open, setOpen] = React.useState(false);
        const [query, setQuery] = React.useState("");
        const found = searchCountries(query);
        const off = disabled === true || readOnly === true;

        return (
            <div
                className={cn("flex min-w-0", className)}
                data-slot="phone-input"
            >
                <Popover
                    open={open}
                    onOpenChange={(next) => {
                        setOpen(next);
                        if (!next) setQuery("");
                    }}
                >
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            disabled={off}
                            aria-label={`${countryLabel}: ${country.name} +${country.dial}`}
                            data-slot="phone-country"
                            className={cn(
                                "flex h-[38px] shrink-0 cursor-pointer items-center gap-1 rounded-l-md rounded-r-none border border-r-0 border-input bg-field pl-2.5 pr-2 text-sm tabular-nums coarse:h-11 coarse:text-base",
                                fieldFocus,
                                fieldStates,
                                boxClassName,
                                "rounded-r-none border-r-0 px-2.5 focus-visible:z-10",
                            )}
                        >
                            <span
                                aria-hidden
                                className="text-base leading-none"
                            >
                                {countryFlag(country.code)}
                            </span>
                            <span>+{country.dial}</span>
                            <ChevronDown
                                aria-hidden
                                className="size-3.5 text-muted-foreground"
                            />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="start"
                        className="w-72 p-0"
                        // Enter picks a country here; it must not also reach
                        // a form or a group that saves on Enter.
                        onKeyDown={(e) => {
                            if (e.key === "Enter") e.stopPropagation();
                        }}
                    >
                        <Command
                            shouldFilter={false}
                            label="Search country or code"
                        >
                            <CommandInput
                                value={query}
                                onValueChange={setQuery}
                                placeholder="Search country or code"
                                aria-label="Search country or code"
                            />
                            <CommandList>
                                <CommandEmpty>No country matches.</CommandEmpty>
                                <CommandGroup>
                                    {found.map((c) => (
                                        <CommandItem
                                            key={c.code}
                                            value={c.code}
                                            onSelect={() => {
                                                change({
                                                    country: c.code,
                                                    national: parts.national,
                                                });
                                                setOpen(false);
                                                setQuery("");
                                                numberRef.current?.focus();
                                            }}
                                            className="gap-2"
                                        >
                                            <span
                                                aria-hidden
                                                className="text-base leading-none"
                                            >
                                                {countryFlag(c.code)}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate">
                                                {c.name}
                                            </span>
                                            <span className="tabular-nums text-muted-foreground">
                                                +{c.dial}
                                            </span>
                                            <Check
                                                aria-hidden
                                                className={cn(
                                                    "size-4",
                                                    c.code === country.code
                                                        ? "opacity-100"
                                                        : "opacity-0",
                                                )}
                                            />
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
                <Input
                    {...props}
                    ref={numberBox}
                    type="tel"
                    inputMode="tel"
                    autoComplete={autoComplete}
                    disabled={disabled}
                    readOnly={readOnly}
                    value={parts.national}
                    onChange={(e) =>
                        change({
                            country: parts.country,
                            national: e.target.value,
                        })
                    }
                    onPaste={(e) => {
                        onPaste?.(e);
                        if (e.defaultPrevented) return;
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
                    onBlur={(e) => {
                        // "+44 20 7946 0958" typed in the box: its code moves
                        // to the picker once the box is left.
                        if (HAS_CODE.test(parts.national)) {
                            change(splitPhone(parts.national, parts.country));
                        }
                        onBlur?.(e);
                    }}
                    className={cn(
                        "min-w-0",
                        boxClassName,
                        "rounded-l-none tabular-nums",
                    )}
                />
            </div>
        );
    },
);
PhoneInput.displayName = "PhoneInput";

export { PhoneInput };
