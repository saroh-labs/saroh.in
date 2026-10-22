"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";

import { ChipGroup } from "@/components/shared/fields/choice-group";

import {
    LABEL,
    NumberField,
} from "@/components/services/service-editor/fields";

/** The lengths most services run to, in minutes. */
export const LENGTHS = ["15", "30", "45", "60", "90"] as const;

const CUSTOM = "custom";

const CHOICES: { value: string; label: string }[] = [
    ...LENGTHS.map((minutes) => ({ value: minutes, label: `${minutes} min` })),
    { value: CUSTOM, label: "Other" },
];

/**
 * How long it takes (Bookings audit, 12 Oct 2026; U16's "How long does it
 * take?"): a chip for the usual lengths, and Other for any other, which
 * shows a number field. The value is the same string of minutes either
 * way, so the page's rules and what Save sends are unchanged.
 *
 * A saved length that is none of the chips opens on Other. Choosing Other
 * keeps the minutes there were, so nothing is lost on the way.
 */
export function LengthField({
    value,
    onChange,
    error,
    onLeave,
    label = "How long does it take?",
    note,
}: {
    /** The question over the chips. */
    label?: string;
    /** A line under the chips: what the length means for the day. */
    note?: ReactNode;
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
            <div id={id} className={`${LABEL} mb-2`}>
                {label}
            </div>
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
                        label="Other length (min)"
                        value={value}
                        onChange={onChange}
                        width="w-[120px]"
                        error={error}
                        onLeave={onLeave}
                    />
                </div>
            ) : null}
            {note ? (
                <p className="mt-1.5 text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                    {note}
                </p>
            ) : null}
        </div>
    );
}
