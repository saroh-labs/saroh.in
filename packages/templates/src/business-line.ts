/**
 * One true line about a business, from what it already told Saroh
 * (starter v4, DEC-141): "Haircut, Colour and Bridal styling in Bengaluru".
 *
 * A new site's hero used to carry a note to the owner ("Say what you do and
 * where, in one line.") because nothing knew what the business does. But a
 * business that takes bookings has named its services, and one that sells
 * has named its categories, and its profile says which town it is in. This
 * joins those, in the owner's own words and spelling, and says nothing
 * else: no adjective, no claim, no greeting.
 *
 * Where nothing true can be said the answer is `undefined`, and the caller
 * leaves the line out. It never returns a prompt.
 *
 * Pure, so the rule is tested on its own and the API, the upgrade and the
 * gallery's renders all compose the same line.
 */

/** How many of the business's own names the line carries. */
export const BUSINESS_LINE_MAX_NAMES = 3;

/** A name longer than this is a sentence, not a name; it is left out. */
export const BUSINESS_LINE_NAME_MAX = 40;

/** The line never runs past this: it sits under a headline. */
export const BUSINESS_LINE_MAX = 110;

export interface BusinessLineFacts {
    /**
     * What the business offers, in its own names and its own order: its
     * services where it takes bookings, else the categories it sells in.
     */
    offers?: readonly (string | null | undefined)[];
    /** Its town, as its profile has it. */
    area?: string | null;
}

/** A name as it is written into the line: one line, single spaces. */
function tidy(value: string | null | undefined): string {
    return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * A town as a sentence may name it. A value with a digit in it is an
 * address or a postcode typed into the wrong field, and a long one is a
 * full address: neither is said.
 */
export function businessArea(value: string | null | undefined): string | null {
    const area = tidy(value);
    if (area === "" || area.length > BUSINESS_LINE_NAME_MAX) return null;
    if (/\d/.test(area)) return null;
    return area;
}

/** The names the line may carry: tidy, short, each once, in order. */
function names(offers: BusinessLineFacts["offers"]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of offers ?? []) {
        const name = tidy(raw);
        if (name === "" || name.length > BUSINESS_LINE_NAME_MAX) continue;
        const key = name.toLocaleLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(name);
    }
    return out;
}

/** "A", "A and B", "A, B and C"; `more` adds "and more" for the rest. */
function listed(items: readonly string[], more: boolean): string {
    if (more) return `${items.join(", ")} and more`;
    if (items.length <= 1) return items[0] ?? "";
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The line, or `undefined` when the business has named nothing it offers.
 * A town alone is not what a business does, so it is not a line.
 *
 * Names are kept exactly as the owner wrote them (a service called
 * "Thai massage" must not become "thai massage"). Past three, the rest are
 * "and more". A line that would run long drops names from the end before
 * it drops the town.
 */
export function composeBusinessLine(
    facts: BusinessLineFacts,
): string | undefined {
    const all = names(facts.offers);
    if (all.length === 0) return undefined;
    const area = businessArea(facts.area);
    const where = area ? ` in ${area}` : "";
    for (
        let count = Math.min(all.length, BUSINESS_LINE_MAX_NAMES);
        count >= 1;
        count--
    ) {
        const line = `${listed(all.slice(0, count), all.length > count)}${where}`;
        if (line.length <= BUSINESS_LINE_MAX) return line;
    }
    return undefined;
}
