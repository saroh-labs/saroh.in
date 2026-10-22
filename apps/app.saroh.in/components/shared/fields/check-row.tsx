"use client";

import { Checkbox } from "@saroh/ui/checkbox";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { Switch } from "@saroh/ui/switch";
import { useId } from "react";

/**
 * A tick with its words: the shared `Checkbox`, and a label that takes the
 * press too, 44px tall under a thumb. The words are the tick's name, so a
 * screen reader hears them and a test finds it by them.
 *
 * `className` sets the row (a bordered card for a row in a list of ticks,
 * `items-start` for a sentence that wraps). The words are the row's own
 * size and weight (13px, regular): a tick's label is a sentence, not a
 * field's caption.
 */
export function CheckRow({
    checked,
    onChange,
    disabled = false,
    id,
    className,
    boxClassName,
    children,
    ...aria
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    id?: string;
    className?: string;
    boxClassName?: string;
    children: React.ReactNode;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
}) {
    const made = useId();
    const boxId = id ?? `${made}-tick`;
    return (
        <Label
            htmlFor={boxId}
            className={cn(
                "flex min-w-0 items-center gap-2 text-[13px] font-normal leading-snug coarse:min-h-11",
                disabled ? "cursor-not-allowed" : "cursor-pointer",
                className,
            )}
        >
            <Checkbox
                id={boxId}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(v) => onChange(v === true)}
                className={boxClassName}
                {...aria}
            />
            {children}
        </Label>
    );
}

/**
 * A switch with its words: the shared `Switch` at the far side of a row
 * that takes the press too. For something that takes effect as it is
 * flipped; a choice that waits for Save is a `CheckRow`.
 */
export function SwitchRow({
    checked,
    onChange,
    disabled = false,
    id,
    name,
    size = "sm",
    side = "end",
    className,
    children,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    id?: string;
    /** The accessible name, when it says more than the visible words. */
    name?: string;
    size?: "default" | "sm";
    /** Which side of the words the switch sits. */
    side?: "start" | "end";
    className?: string;
    children: React.ReactNode;
}) {
    const made = useId();
    const switchId = id ?? `${made}-switch`;
    const control = (
        <Switch
            id={switchId}
            size={size}
            checked={checked}
            disabled={disabled}
            aria-label={name}
            onCheckedChange={onChange}
        />
    );
    return (
        <Label
            htmlFor={switchId}
            className={cn(
                "flex min-w-0 items-center gap-2.5 text-[13px] font-normal leading-snug coarse:min-h-11",
                disabled ? "cursor-not-allowed" : "cursor-pointer",
                className,
            )}
        >
            {side === "start" ? control : null}
            {children}
            {side === "end" ? control : null}
        </Label>
    );
}
