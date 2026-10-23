import type { HomeChequesWaiting, HomeNeedGroup, HomeWeek } from "./service";

/**
 * "Cheques not in the bank" on Home (DEC-173, Home plan U18): one line in
 * Needs you's money group, shown only while a cheque waits, on the desk
 * and on a phone. It counts as one thing in Needs you, however many
 * cheques wait, and opens the invoices list filtered to them, where "Mark
 * as in the bank" and "Bounced" live: Home never marks a cheque itself.
 * Its words are in `group-words.ts` (`chequesTitle`).
 *
 * The API sends it on `week.chequesWaiting` only to someone who holds
 * `payment:read` (DEC-098), and null while none waits, so a missing figure
 * draws nothing. Pure, so it is tested without a page.
 */

/** The cheques waiting, or null: nothing to draw. */
export function chequesWaiting(
    week: Pick<HomeWeek, "chequesWaiting"> | null | undefined,
): HomeChequesWaiting | null {
    const c = week?.chequesWaiting;
    return c && c.count > 0 ? c : null;
}

/** Needs you's count with the cheques line in it: one thing. */
export function totalWithCheques(
    total: number,
    cheques: HomeChequesWaiting | null,
): number {
    return cheques ? total + 1 : total;
}

/**
 * Where the desk draws the line among the groups, which come in the
 * board's order: right under the bills group, or in its place when the
 * business has no unpaid bills (after orders, before the rest).
 */
export function deskChequesAt(groups: readonly HomeNeedGroup[]): number {
    const bills = groups.findIndex((g) => g.kind === "BILLS");
    if (bills !== -1) return bills + 1;
    const after = groups.findIndex((g) => g.kind !== "ORDERS");
    return after === -1 ? groups.length : after;
}

/**
 * Where a phone draws the line among its lines (late first, then money,
 * then the rest): right under the bills line, or where bills would be,
 * first of the money, when there are none.
 */
export function phoneChequesAt(lines: readonly HomeNeedGroup[]): number {
    const bills = lines.findIndex((g) => g.kind === "BILLS");
    if (bills !== -1) return bills + 1;
    const after = lines.findIndex(
        (g) => !(g.late > 0 && (g.kind === "ORDERS" || g.kind === "BILLS")),
    );
    return after === -1 ? lines.length : after;
}
