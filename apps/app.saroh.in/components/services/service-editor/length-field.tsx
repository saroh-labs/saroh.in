"use client";

import { useId, useState } from "react";

import { Eyebrow } from "@/components/bookings/calendar/parts";
import { ChipGroup } from "@/components/shared/choice-group";

import { NumberField } from "./fields";

/** The lengths most services run to, in minutes. */
export const LENGTHS = ["15", "30", "45", "60", "90"] as const;

const CUSTOM = "custom";

const CHOICES: { value: string; label: string }[] = [
    ...LENGTHS.map((minutes) => ({ value: minutes, label: `${minutes} min` })),
    { value: CUSTOM, label: "Custom" },
];

/**
 * How long each visit is (Bookings audit, 12 Oct 2026): a chip for the
 * usual lengths, and Custom for any other, which shows the number field
 * the page had before. The value is the same string of minutes either
 * way, so the page's rules and what Save sends are unchanged.
 *
 * A saved length that is none of the chips opens on Custom. Choosing
 * Custom keeps the minutes there were, so nothing is lost on the way.
 */
export function LengthField({
    value,
    onChange,
    error,
    onLeave,
}: {
    /** Minutes, as typed. */
    value: string;
    onChange: (minutes: string) => void;
    /** What is wrong with the length, once it should be said. */
    error?: string | null;
    onLeave?: () => void;
}) {
    const id = useId();
    const [chosen, setChosen] = useState(false);
    const preset = (LENGTHS as readonly string[]).includes(value);
    const custom = chosen || !preset;
    return (
        <div className="min-w-0">
            <Eyebrow id={id}>Each visit</Eyebrow>
            <ChipGroup
                labelledBy={id}
                value={custom ? CUSTOM : value}
                onChange={(next) => {
                    setChosen(next === CUSTOM);
                    if (next !== CUSTOM) onChange(next);
                }}
                choices={CHOICES}
            />
            {custom ? (
                <div className="mt-2.5">
                    <NumberField
                        label="Custom length (min)"
                        value={value}
                        onChange={onChange}
                        width="w-[120px]"
                        error={error}
                        onLeave={onLeave}
                    />
                </div>
            ) : null}
        </div>
    );
}
