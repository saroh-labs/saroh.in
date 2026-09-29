import type { ContactRemoval, RemovalPreview } from "./service";

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

// ── Privacy removal (DEC-042, C11) ──────────────────────────────────────

/**
 * "Remove their details (privacy request)…"'s paragraph, after the design:
 * what goes, and that their orders stay. Around the design's two sentences
 * it adds only what this person has: bookings still to come (cancelled),
 * autopay (cancelled at the provider first) and the leads and form entries
 * that stay (DEC-041, 2026-09-27).
 */
export function removalBody(p: Pick<RemovalPreview, "goes" | "stays">): string {
    const parts = [
        "Their name, email, phone and address are removed and cannot be brought back.",
    ];
    const { orders } = p.stays;
    if (orders > 0) {
        parts.push(
            `Their ${count(orders, "order", "orders")} ${orders === 1 ? "stays" : "stay"} in Orders as “Removed customer”, so your totals and records stay right.`,
        );
    }
    const { bookingsCancelled } = p.goes;
    if (bookingsCancelled > 0) {
        parts.push(
            `Their ${count(bookingsCancelled, "booking", "bookings")} still to come ${bookingsCancelled === 1 ? "is" : "are"} cancelled.`,
        );
    }
    if (p.goes.autopay > 0) {
        parts.push("Their autopay is cancelled first.");
    }
    const crm = [
        p.stays.leads > 0 ? count(p.stays.leads, "lead", "leads") : null,
        p.stays.submissions > 0
            ? count(p.stays.submissions, "form entry", "form entries")
            : null,
    ].filter((s): s is string => s !== null);
    if (crm.length > 0) {
        const one = p.stays.leads + p.stays.submissions === 1;
        parts.push(
            `Their ${crm.join(" and ")} ${one ? "stays" : "stay"} as ${one ? "it is" : "they are"}.`,
        );
    }
    return parts.join(" ");
}

/**
 * "Type ‹name› to confirm", as the design asks: the name as the page shows
 * it, ignoring spaces around it and runs of spaces within.
 */
export function confirmMatches(typed: string, name: string): boolean {
    const norm = (s: string) => s.trim().replace(/\s+/g, " ");
    return norm(name).length > 0 && norm(typed) === norm(name);
}

/** The toast once they're removed, in the design's words. */
export const REMOVED_TOAST = "Details removed. Their orders stay in Orders.";

/** An API sentence, ended with a full stop for the page. */
export function asSentence(message: string): string {
    const m = message.trim();
    return /[.!?]$/.test(m) ? m : `${m}.`;
}
