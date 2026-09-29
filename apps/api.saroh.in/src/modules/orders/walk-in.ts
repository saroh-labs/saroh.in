/**
 * Walk-in orders (plan B, B13). An order taken at the counter for someone
 * who leaves only their name has no storefront customer (`customerId` is
 * null): it carries the name they gave instead, and no contact is made.
 *
 * A walk-in who gives a phone is a customer (B13b, 2026-09-28): New order
 * makes the order for the store customer that phone finds or makes, so it
 * is not a walk-in here. `walkInPhone` is only on walk-ins taken before
 * that, which still read with it.
 *
 * Every reader that names an order's customer goes through here, so a
 * walk-in reads the same everywhere: by their name, never an email, and
 * never as a broken or blank row.
 */

import { contactEmailForDisplay } from "../contacts/contact-email";

/** The fields a walk-in is read from. */
export interface WalkInFields {
    customerId?: string | null;
    walkInName?: string | null;
    walkInPhone?: string | null;
}

/** What a walk-in is called when, somehow, no name was kept. */
export const WALK_IN = "Walk-in";

/** The walk-in's name as kept, or null when blank. */
function nameOf(order: WalkInFields): string | null {
    const name = order.walkInName?.trim();
    return name !== undefined && name.length > 0 ? name : null;
}

/** True when the order was taken for a walk-in, not a customer. */
export function isWalkIn(order: WalkInFields): boolean {
    return !order.customerId;
}

/**
 * The walk-in on an order, or null when it names a customer. The phone
 * goes only to a caller who may read a customer's own details
 * (`contact:read`), as a customer's phone does.
 */
export function walkInOf(
    order: WalkInFields,
    contactRead: boolean,
): { name: string; phone: string | null } | null {
    if (!isWalkIn(order)) return null;
    return {
        name: nameOf(order) ?? WALK_IN,
        phone: contactRead ? (order.walkInPhone ?? null) : null,
    };
}

/** A customer's name as the order lists show it: first and last. */
export function customerName(
    customer: { firstName?: string | null; lastName?: string | null } | null,
): string {
    if (!customer) return "";
    return [customer.firstName, customer.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
}

/**
 * Who an order is for, in words: the customer's name, else their email;
 * a walk-in's name, labelled "(walk-in)" where `label` asks for it. Never
 * empty.
 */
export function orderPartyName(
    order: WalkInFields & {
        customer?: {
            firstName?: string | null;
            lastName?: string | null;
            email?: string | null;
        } | null;
    },
    opts: { label?: boolean } = {},
): string {
    if (order.customer) {
        const name = customerName(order.customer);
        if (name) return name;
        // Never a placeholder: a walk-in kept by their phone (B13b).
        return contactEmailForDisplay(order.customer.email) ?? "Customer";
    }
    const name = nameOf(order);
    if (!name) return WALK_IN;
    return opts.label ? `${name} (walk-in)` : name;
}

/** An order with a customer, as a filter that narrows the type. */
export function hasCustomer<T extends { customerId: string | null }>(
    order: T,
): order is T & { customerId: string } {
    return order.customerId !== null;
}
