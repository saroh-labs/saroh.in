"use client";

import type { TeamOption } from "@/lib/calendar/team";
import { OptionSelect } from "@saroh/ui/option-select";

/**
 * Everyone, or one person (plan 005 E24), after the design: a
 * select before the layer switches. Only drawn when the filter lists
 * someone (`teamOptions`), which is only for a viewer who reads bookings.
 */
export function TeamFilter({
    options,
    value,
    onChange,
}: {
    options: TeamOption[];
    /** The person picked; null for Everyone. */
    value: string | null;
    onChange: (person: string | null) => void;
}) {
    return (
        <OptionSelect
            size="sm"
            className="w-auto"
            aria-label="Team member"
            value={value ?? ""}
            onValueChange={(person) => onChange(person || null)}
            options={[
                { value: "", label: "Everyone" },
                ...options.map((o) => ({ value: o.id, label: o.name })),
            ]}
        />
    );
}
