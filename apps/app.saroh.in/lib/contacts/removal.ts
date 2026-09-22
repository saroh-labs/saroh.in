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
    ].filter(Boolean);
    const withWhat =
        went.length === 0
            ? ""
            : `, with ${went.length === 1 ? went[0] : `${went.slice(0, -1).join(", ")} and ${went.at(-1)}`}`;
    const cancelled =
        data.bookingsCancelled > 0
            ? `. ${count(data.bookingsCancelled, "booking", "bookings")} paid with a pack ${data.bookingsCancelled === 1 ? "was" : "were"} cancelled`
            : "";
    return `${name} deleted${withWhat}${cancelled}`;
}
