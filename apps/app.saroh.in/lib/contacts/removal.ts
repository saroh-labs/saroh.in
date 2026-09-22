import type { ContactRemoval } from "./service";

const count = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;

/** "Asha Rao deleted, with 2 leads, 1 subscription and 1 class pack". */
export function deletedLine(name: string, data: ContactRemoval): string {
    const went = [
        data.leads > 0 ? count(data.leads, "lead", "leads") : null,
        data.subscriptions > 0
            ? count(data.subscriptions, "subscription", "subscriptions")
            : null,
        data.packs > 0 ? count(data.packs, "class pack", "class packs") : null,
        data.courses > 0 ? count(data.courses, "course", "courses") : null,
    ].filter(Boolean);
    const withWhat =
        went.length === 0
            ? ""
            : `, with ${went.length === 1 ? went[0] : `${went.slice(0, -1).join(", ")} and ${went.at(-1)}`}`;
    const cancelled =
        data.bookingsCancelled > 0
            ? `. ${count(data.bookingsCancelled, "booking", "bookings")} still to come ${data.bookingsCancelled === 1 ? "was" : "were"} cancelled`
            : "";
    return `${name} deleted${withWhat}${cancelled}`;
}

/** What a person holds that deleting them ends; undefined when not known. */
export interface Holdings {
    subscriptions?: number;
    packs?: number;
    courses?: number;
}

const GENERAL =
    "Any subscription, class pack or course seat they hold ends, and their bookings paid with a pack or for a course are cancelled. ";

/**
 * The delete confirmation's middle sentence. With every count known — the
 * contact page read all three — it names them: "Their 2 subscriptions and
 * 1 class pack go too." With one unknown (a panel not shown, or not read) it
 * says the same in general terms rather than guess a number. Counts are what
 * the delete itself counts: subscriptions running or paused, packs not yet
 * expired, and course seats still held.
 */
export function holdingsSentence(h: Holdings): string {
    const { subscriptions, packs, courses } = h;
    if (
        subscriptions === undefined ||
        packs === undefined ||
        courses === undefined
    ) {
        return GENERAL;
    }
    const held = [
        subscriptions > 0
            ? count(subscriptions, "subscription", "subscriptions")
            : null,
        packs > 0 ? count(packs, "class pack", "class packs") : null,
        courses > 0 ? count(courses, "course seat", "course seats") : null,
    ].filter((s): s is string => s !== null);
    if (held.length === 0) return "";
    const one = held.length === 1 && subscriptions + packs + courses === 1;
    const last = held.at(-1) ?? "";
    const list = one
        ? last.replace(/^1 /, "")
        : held.length === 1
          ? last
          : `${held.slice(0, -1).join(", ")} and ${last}`;
    const bookings =
        packs > 0 || courses > 0
            ? ", and their bookings paid with a pack or for a course are cancelled"
            : "";
    return `Their ${list} ${one ? "goes" : "go"} too${bookings}. `;
}
