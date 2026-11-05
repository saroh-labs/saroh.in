"use client";

import { DateInput } from "@saroh/ui/date-picker";
import type { FieldProps } from "@saroh/ui/field";
import { Field as FieldFrame } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { OptionSelect } from "@saroh/ui/option-select";
import { Textarea } from "@saroh/ui/textarea";
import type { ComponentProps } from "react";

type Frame = Pick<FieldProps, "label" | "hint" | "error" | "optional"> & {
    className?: string;
};

/** `@saroh/ui`'s `Field` around its `Input`. A value set in mono is `[&_input]:font-mono`. */
export function Field({
    label,
    hint,
    error,
    optional,
    className,
    ...props
}: Frame & ComponentProps<typeof Input>) {
    return (
        <FieldFrame
            label={label}
            hint={hint}
            error={error}
            optional={optional}
            className={className}
        >
            <Input {...props} />
        </FieldFrame>
    );
}

export function TextArea({
    label,
    hint,
    error,
    optional,
    className,
    rows = 3,
    ...props
}: Frame & ComponentProps<typeof Textarea>) {
    return (
        <FieldFrame
            label={label}
            hint={hint}
            error={error}
            optional={optional}
            className={className}
        >
            <Textarea rows={rows} {...props} />
        </FieldFrame>
    );
}

export function SelectField<T extends string>({
    label,
    optional,
    value,
    options,
    onChange,
}: Pick<Frame, "label" | "optional"> & {
    value: T;
    options: readonly { value: T; label: string }[];
    onChange: (value: T) => void;
}) {
    return (
        <FieldFrame label={label} optional={optional}>
            <OptionSelect
                value={value}
                options={options}
                onValueChange={onChange}
            />
        </FieldFrame>
    );
}

/**
 * `DateInput` sized to its column, with the padding, edge, hover and touch type
 * of the `Input` and `Select` beside it: it draws an outline `Button`, which has
 * none of them. Under 360px the icon goes, so the longest date ("28 Sept 2026")
 * still fits half a 320px screen.
 */
const DATE_BOX =
    "w-full border-input px-3 hover:border-muted-foreground hover:bg-field coarse:text-base max-[359px]:px-1 max-[359px]:[&_svg]:hidden";

export function DateField({
    label,
    value,
    min,
    onChange,
}: {
    label: string;
    value: string;
    /** The earliest day it takes, as "YYYY-MM-DD". */
    min?: string;
    onChange: (value: string) => void;
}) {
    return (
        <FieldFrame label={label}>
            <DateInput
                value={value}
                min={min}
                onValueChange={onChange}
                className={DATE_BOX}
            />
        </FieldFrame>
    );
}
