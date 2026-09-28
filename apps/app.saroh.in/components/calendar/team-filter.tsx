"use client";

import type { TeamOption } from "@/lib/calendar/team";

/**
 * Everyone, or one person (plan 005 E24), after the design: a pill-shaped
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
        <select
            aria-label="Team member"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className="h-8 cursor-pointer rounded-full border border-border bg-card px-2.5 font-sans text-[12.5px] font-semibold text-foreground transition-colors duration-fast hover:border-border-strong hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-accent-active coarse:h-11"
        >
            <option value="">Everyone</option>
            {options.map((o) => (
                <option key={o.id} value={o.id}>
                    {o.name}
                </option>
            ))}
        </select>
    );
}
