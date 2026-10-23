"use client";

import { ListFilter } from "@/components/shared/lists/list-toolbar";
import { count } from "@/lib/format/plural";

const ALL = "";

/**
 * "A filter, not a scope": which location's view of a business-wide list to
 * show. Only offered where there is more than one to choose between.
 *
 * The distinction is the whole reason this control has a note at the bottom.
 * The catalogue and the customer list belong to the BUSINESS; a location
 * decides what it sells and who has bought there. Picking one narrows what is
 * on screen and nothing else. It does not put the rest of the workspace into
 * that location, which is what a scope would do (the workspace design says
 * so in as many words).
 *
 * It is the toolbar's one dropdown (`ListFilter`), as every other filter
 * is: each location's row says how many it holds, and the note sits under
 * the list.
 */
export function StorefrontFilter({
    stores,
    countFor,
    total,
    value,
    onChange,
    noun,
    note,
}: {
    stores: { id: string; name: string }[];
    /**
     * How many rows a location holds, for the row's second line; null when
     * that couldn't be counted, and the line is left out rather than a 0.
     */
    countFor: (storeId: string) => number | null;
    /** How many rows there are in all, for "All locations"; null likewise. */
    total: number | null;
    value: string | null;
    onChange: (storeId: string | null) => void;
    noun: { one: string; other: string };
    /** Why this is a filter and not a scope, in this list's own words. */
    note: string;
}) {
    const held = (n: number | null) =>
        n === null ? undefined : count(n, noun.one, noun.other);
    return (
        <ListFilter
            holdsData
            label="Location"
            value={value ?? ALL}
            onValueChange={(v) => onChange(v === ALL ? null : v)}
            options={[
                { value: ALL, label: "All locations", hint: held(total) },
                ...stores.map((s) => ({
                    value: s.id,
                    label: s.name,
                    hint: held(countFor(s.id)),
                })),
            ]}
            footer={note}
        />
    );
}
