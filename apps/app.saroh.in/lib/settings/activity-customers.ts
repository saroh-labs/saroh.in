import { personHref } from "@/lib/contacts/person-href";

import { counted, countOf, fieldsOf, record } from "./activity-changes";

/**
 * Settings › Activity's words for a customer record (C10): a merge
 * (`customer.merged`, C9) and staff changing someone's details
 * (`customer.details.changed`, C8).
 *
 * The stream holds ids, counts and field names only, never a person's
 * name, email or phone (DEC-035), so the line doesn't name the customer;
 * it links to them instead. A merge's line says what moved; a details
 * change says which details, never what they became.
 */

/** The customer page an event is about, or the list when it isn't named. */
export function customerPlace(contactId: string | null): {
    label: string;
    href: string;
} {
    return contactId
        ? {
              label: "Customer",
              href: personHref(contactId),
          }
        : { label: "Customers", href: "/commerce/customers" };
}

/** What a merge recorded as moved, in the order the dialog shows it. */
const MOVED: readonly [key: string, one: string, many?: string][] = [
    ["orders", "order"],
    ["bookings", "booking"],
    ["invoices", "invoice"],
    ["subscriptions", "subscription"],
    ["packs", "class pack"],
    ["courses", "course enrolment"],
    ["notes", "note"],
    ["attention", "Needs attention entry", "Needs attention entries"],
    ["messages", "message"],
    ["leads", "lead"],
    ["submissions", "form entry", "form entries"],
    ["links", "location record"],
];

/** "3 orders", "1 note" — each kind the merge moved, none for nothing. */
export function mergedMoves(meta: Record<string, unknown>): string[] {
    const moved = record(meta.moved);
    return MOVED.flatMap(([key, one, many]) => {
        const n = countOf(moved[key]) ?? 0;
        return n > 0 ? [counted(n, one, many)] : [];
    });
}

/** "a, b and c" */
function list(items: readonly string[]): string {
    if (items.length <= 1) return items[0] ?? "";
    return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** "merged a duplicate customer record — 3 orders and 1 note moved". */
export function mergedWhat(meta: Record<string, unknown>): string {
    const moves = mergedMoves(meta);
    const said =
        moves.length > 3
            ? `${moves.slice(0, 3).join(", ")} and more`
            : list(moves);
    const tail = said ? ` — ${said} moved` : "";
    return `merged a duplicate customer record${tail}`;
}

/** How a sentence names a customer detail a staff edit changed (C8). */
const DETAIL_PHRASE: Partial<Record<string, string>> = {
    firstName: "name",
    lastName: "name",
    email: "email",
    phone: "phone",
    company: "company",
    address: "address",
};

/** The details a change touched, once each: ["name", "email"]. */
export function changedDetails(meta: Record<string, unknown>): string[] {
    const out: string[] = [];
    for (const field of fieldsOf(meta)) {
        const phrase = DETAIL_PHRASE[field] ?? "other details";
        if (!out.includes(phrase)) out.push(phrase);
    }
    return out;
}

/** "changed a customer's email and address". */
export function detailsWhat(meta: Record<string, unknown>): string {
    const details = changedDetails(meta);
    return details.length
        ? `changed a customer's ${list(details)}`
        : "changed a customer's details";
}

/**
 * "removed a customer's details (privacy request) — 1 booking to come
 * cancelled" (`customer.removed`, C11). Counts only: who they were is
 * gone, and the stream never held it.
 */
export function removedWhat(meta: Record<string, unknown>): string {
    const removed = record(meta.removed);
    const cancelled = countOf(removed.bookingsCancelled) ?? 0;
    const base = "removed a customer's details (privacy request)";
    return cancelled > 0
        ? `${base} — ${counted(cancelled, "booking to come", "bookings to come")} cancelled`
        : base;
}

/** The sheet's rows for a details change: each detail, no values. */
export function detailsLabels(meta: Record<string, unknown>): string[] {
    return changedDetails(meta).map(
        (d) => d.charAt(0).toUpperCase() + d.slice(1),
    );
}
