/**
 * When planned work is expected, as the changelog's Coming next and the
 * Integrations page's Planned list both say it (owner, 10 Oct 2026): the
 * nearest group keeps its months, the one after is "Early 2027", and
 * everything further out is "Later", with no date to miss.
 *
 * A group's label is drawn once, over its rows, never on every row.
 */
export const COMING_GROUPS = [
    { key: "next", label: "Nov–Dec 2026" },
    { key: "early-2027", label: "Early 2027" },
    { key: "later", label: "Later" },
] as const;

export type ComingGroupKey = (typeof COMING_GROUPS)[number]["key"];

/** The pill on every planned row, on both pages. */
export const NOT_AVAILABLE_YET = "Not available yet";

export interface ComingGroup<T> {
    key: ComingGroupKey;
    label: string;
    rows: T[];
}

/** The rows under their groups, nearest first. A group with no rows is left out. */
export function byComingGroup<T extends { group: ComingGroupKey }>(
    rows: readonly T[],
): ComingGroup<T>[] {
    return COMING_GROUPS.map((group) => ({
        key: group.key,
        label: group.label,
        rows: rows.filter((row) => row.group === group.key),
    })).filter((group) => group.rows.length > 0);
}
