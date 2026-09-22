"use client";

import { cn } from "@saroh/ui/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";

/**
 * Radix reserves the empty string (it means "cleared"), so an option whose
 * value is "" — a "None" row — travels as this instead and is mapped back.
 */
const NONE = "__none__";

export interface Option<V extends string> {
    value: V;
    label: string;
}

/**
 * What Radix is given for `value`.
 *
 * "" means two different things. With a "None" row among the options it is
 * that row, so it travels as {@link NONE}. Without one it means nothing is
 * chosen yet — and Radix must get "" to show the placeholder. Sending NONE
 * then selected a row that does not exist, and the trigger rendered blank:
 * "Select a customer…" on New order never appeared.
 */
export function radixValue<V extends string>(
    value: V,
    options: readonly Option<V>[],
): string {
    if (value !== "") return value;
    return options.some((o) => o.value === "") ? NONE : "";
}

/**
 * A shadcn Select over a flat list of options, for the places that were a
 * native `<select>`. The native control drew the operating system's menu —
 * a different one per browser, unstyled, and in dark mode often a white list
 * on a dark page — next to fields that all use the product's own.
 */
export function OptionSelect<V extends string>({
    value,
    onValueChange,
    options,
    id,
    disabled,
    placeholder,
    className,
    size = "default",
    ...aria
}: {
    value: V;
    onValueChange: (value: V) => void;
    options: readonly Option<V>[];
    id?: string;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
    /** `sm` for toolbars and table rows. */
    size?: "default" | "sm";
    "aria-label"?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
}) {
    return (
        <Select
            value={radixValue(value, options)}
            onValueChange={(v) => {
                onValueChange((v === NONE ? "" : v) as V);
            }}
            disabled={disabled}
        >
            <SelectTrigger
                id={id}
                aria-label={aria["aria-label"]}
                aria-describedby={aria["aria-describedby"]}
                aria-invalid={aria["aria-invalid"]}
                className={cn(size === "sm" && "h-8 text-xs", className)}
            >
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {options.map((o) => (
                    <SelectItem
                        key={o.value || NONE}
                        value={o.value === "" ? NONE : o.value}
                    >
                        {o.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
