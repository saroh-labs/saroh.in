/**
 * What this person may do at one location, as its read says it
 * (`abilities` on `GET /stores/:id`; UX audit, 10 Oct 2026).
 *
 * Someone invited to a location holds a business role that changes nothing
 * (the kitchen's view of orders) and a location role that may: an Admin,
 * Manager or Editor renames the place and takes and changes its orders,
 * never their money (DEC-106), and a Viewer reads. The business role's
 * permissions can't say that, so the app used to show all four the same
 * read-only screens. The API answers each with the function the write's
 * own guard asks, so a screen offers exactly what would be taken.
 *
 * Pure and client-safe. An API from before the field sends none, and
 * nothing more is offered (`null`).
 */
export interface LocationAbilities {
    /** Rename it, describe it, change its logo. */
    edit: boolean;
    /** Take a new order here, with nothing paid yet. */
    takeOrders: boolean;
    /** Take the money with a new order. */
    takePayments: boolean;
    /** Change an order's status here, never its payment. */
    changeOrders: boolean;
}

const KEYS = ["edit", "takeOrders", "takePayments", "changeOrders"] as const;

/** The read's `abilities`, or `null` when it sent none it can vouch for. */
export function abilitiesOf(value: unknown): LocationAbilities | null {
    if (typeof value !== "object" || value === null) return null;
    const said = value as Record<string, unknown>;
    if (!KEYS.every((key) => typeof said[key] === "boolean")) return null;
    return {
        edit: said.edit === true,
        takeOrders: said.takeOrders === true,
        takePayments: said.takePayments === true,
        changeOrders: said.changeOrders === true,
    };
}

/** A location someone may take an order at, and whether its money too. */
export interface OrderPlace {
    id: string;
    /** May record a payment with the order; else it is paid on collection. */
    money: boolean;
}

/**
 * Where New order is offered to someone whose business role doesn't take
 * orders: the locations whose own read says they may. Empty when none
 * does, and then there is no New order.
 */
export function orderPlaces(
    reads: readonly { id: string; abilities: LocationAbilities | null }[],
): OrderPlace[] {
    return reads
        .filter((r) => r.abilities?.takeOrders)
        .map((r) => ({ id: r.id, money: r.abilities?.takePayments === true }));
}
