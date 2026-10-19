import { shortName } from "./days-off";
import type { LayerStyle, Off } from "./layers";
import type { TeamOption } from "./team";

/**
 * The words of the Calendar month's one filter button, "What to show"
 * (bookings U13, BKMOverviewMonth / BKDCalMonth): whose things, and which
 * layers are on. Pure, so the words are tested without a browser.
 */

/** "a", "a and b", "a, b and c". */
export function listed(words: string[]): string {
    if (words.length < 2) return words[0] ?? "";
    return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The layers switched on, in lower case: "bookings, classes and invoices". */
export function layersOn(layers: LayerStyle[], off: Off): string {
    const on = layers.filter((l) => !off[l.key]);
    return on.length === 0
        ? "nothing"
        : listed(on.map((l) => l.label.toLowerCase()));
}

/**
 * The button's label: "Everyone · bookings, classes and invoices", or
 * "Meera · bookings" with one person picked. A business with no team to
 * pick from says only the layers, from a capital.
 */
export function filterLabel({
    layers,
    off,
    people,
    person,
}: {
    layers: LayerStyle[];
    off: Off;
    people: TeamOption[];
    person: string | null;
}): string {
    const what = layersOn(layers, off);
    if (people.length === 0) return what[0].toUpperCase() + what.slice(1);
    const name = people.find((p) => p.id === person)?.name;
    return `${name ? shortName(name) : "Everyone"} · ${what}`;
}

/**
 * The overlay's button, which closes it on what is picked: the phone's
 * "Show all 3" or "Show 2"; the desk's "Show everything" or "Show bookings
 * and classes", as each board says it.
 */
export function showLabel(
    layers: LayerStyle[],
    off: Off,
    phone: boolean,
): string {
    const on = layers.filter((l) => !off[l.key]);
    if (phone) {
        if (on.length === layers.length && layers.length > 1) {
            return `Show all ${layers.length}`;
        }
        return on.length === 0 ? "Show nothing" : `Show ${on.length}`;
    }
    return on.length === layers.length
        ? "Show everything"
        : `Show ${layersOn(layers, off)}`;
}
