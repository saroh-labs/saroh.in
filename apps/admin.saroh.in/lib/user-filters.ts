/**
 * The Users list's address (admin console U9, R13): a search (`q`) and the
 * chips (`filter`, comma separated). Client-safe: the page reads it on the
 * server and the toolbar writes it in the browser, from the same rules.
 */

export const USER_CHIPS = [
    "no-business",
    "unverified",
    "owners",
    "joined-this-week",
] as const;

export type UserChip = (typeof USER_CHIPS)[number];

/** Each chip's words, in the order the toolbar draws them. */
export const USER_CHIP_LABEL: Record<UserChip, string> = {
    "no-business": "No business yet",
    unverified: "Email not verified",
    owners: "Owners",
    "joined-this-week": "Joined this week",
};

export interface UserListQuery {
    /** The search as typed, trimmed. Sent only at two characters or more. */
    q: string;
    chips: UserChip[];
}

const isChip = (value: string): value is UserChip =>
    (USER_CHIPS as readonly string[]).includes(value);

/** Read the list's address. Unknown chips are dropped, not refused. */
export function readUserListQuery(params: {
    q?: string | string[];
    filter?: string | string[];
}): UserListQuery {
    const first = (value: string | string[] | undefined) =>
        Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
    const q = first(params.q).trim();
    const chips = first(params.filter)
        .split(",")
        .map((part) => part.trim())
        .filter(isChip);
    return {
        q,
        // In the toolbar's order, once each.
        chips: USER_CHIPS.filter((chip) => chips.includes(chip)),
    };
}

/** The list's address for a query. */
export function userListHref(query: UserListQuery): string {
    const search = new URLSearchParams();
    if (query.q) search.set("q", query.q);
    if (query.chips.length > 0) search.set("filter", query.chips.join(","));
    const suffix = search.toString();
    return suffix ? `/users?${suffix}` : "/users";
}

/** The query with one chip turned on or off. */
export function toggleChip(
    query: UserListQuery,
    chip: UserChip,
): UserListQuery {
    const on = query.chips.includes(chip);
    const chips = on
        ? query.chips.filter((c) => c !== chip)
        : USER_CHIPS.filter((c) => c === chip || query.chips.includes(c));
    return { ...query, chips };
}

/** Whether a search is long enough to send: the API needs two characters. */
export function searchable(q: string): boolean {
    return q.trim().length >= 2;
}

/**
 * What narrows the list, for the empty state's way back: "search" when only
 * the search does, "filters" when a chip does.
 */
export function narrowedBy(query: UserListQuery): "search" | "filters" | null {
    if (query.chips.length > 0) return "filters";
    if (query.q) return "search";
    return null;
}
