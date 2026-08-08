"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useEffect, useRef } from "react";

interface OtpInputProps {
    value: string;
    onChange: (value: string) => void;
    /** Fired once the last digit lands, so the form can submit itself. */
    onComplete?: (value: string) => void;
    length: number;
    disabled?: boolean;
    /** Marks every box as invalid and wires up the form's error message. */
    invalid?: boolean;
    describedBy?: string;
}

/**
 * A segmented numeric code field.
 *
 * One real <input> per digit, because that is what gives mobile keyboards and
 * password managers something to aim at. The value is owned by the parent and
 * always normalised to digits, so paste ("039147", or "039 147" out of a mail
 * client) and per-box typing converge on the same state.
 *
 * This is the one control the verify screen exists for, so it carries the
 * screen's motion: the focused box breathes, a landed digit settles with
 * overshoot, and a rejected code shakes the row (see `.sa-otp*` in
 * atmosphere.css). The row is keyed by `invalid` so the shake REPLAYS on a
 * second bad code instead of the class already being present and nothing
 * moving.
 */
export function OtpInput({
    value,
    onChange,
    onComplete,
    length,
    disabled,
    invalid,
    describedBy,
}: OtpInputProps) {
    const inputs = useRef<(HTMLInputElement | null)[]>([]);

    function focusBox(index: number) {
        inputs.current[Math.min(Math.max(index, 0), length - 1)]?.focus();
    }

    // Take focus on arrival. This screen exists to collect six digits and has
    // no other control worth landing on, so making the user click first is pure
    // friction — and it is what surfaces the focus bloom that tells them where
    // to type.
    useEffect(() => {
        inputs.current[0]?.focus();
    }, []);

    // A rejected code clears the field, which would otherwise leave focus
    // nowhere and the user staring at six empty boxes with no cursor.
    useEffect(() => {
        if (invalid) inputs.current[0]?.focus();
    }, [invalid]);

    function commit(next: string, focusIndex: number) {
        const digits = next.replace(/\D/g, "").slice(0, length);
        onChange(digits);
        focusBox(focusIndex);
        if (digits.length === length) onComplete?.(digits);
    }

    function handleChange(index: number, raw: string) {
        const digits = raw.replace(/\D/g, "");
        if (!digits) return;
        // Typing in a box replaces from that box onward; pasting a full code
        // into any box fills the whole field.
        const next =
            value.slice(0, index) + digits + value.slice(index + digits.length);
        commit(next, index + digits.length);
    }

    function handleKeyDown(index: number, e: React.KeyboardEvent) {
        if (e.key === "Backspace") {
            e.preventDefault();
            if (value[index]) {
                // Clear this box, stay put.
                commit(value.slice(0, index) + value.slice(index + 1), index);
            } else {
                // Already empty — eat the previous digit, like a text field.
                commit(value.slice(0, index - 1), index - 1);
            }
            return;
        }
        if (e.key === "ArrowLeft") {
            e.preventDefault();
            focusBox(index - 1);
        }
        if (e.key === "ArrowRight") {
            e.preventDefault();
            focusBox(index + 1);
        }
    }

    return (
        <div
            key={invalid ? "invalid" : "valid"}
            className={cn("flex justify-between gap-2", invalid && "sa-shake")}
        >
            {Array.from({ length }).map((_, index) => (
                <input
                    key={index}
                    ref={(el) => {
                        inputs.current[index] = el;
                    }}
                    // `type="text"` + numeric inputMode: type=number renders
                    // spinners and silently accepts "e"/"+"/"-".
                    type="text"
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    maxLength={length}
                    value={value[index] ?? ""}
                    data-filled={value[index] ? "true" : undefined}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onFocus={(e) => e.target.select()}
                    disabled={disabled}
                    aria-label={`Digit ${index + 1} of ${length}`}
                    aria-invalid={invalid ? true : undefined}
                    aria-describedby={describedBy}
                    className={cn(
                        "sa-otp border-input h-14 w-full rounded-lg border text-center text-xl font-semibold tabular-nums",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        invalid && "border-destructive",
                    )}
                />
            ))}
        </div>
    );
}
