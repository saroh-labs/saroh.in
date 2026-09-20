/**
 * Customer list rows, with the three facts a merchant judges a customer by:
 * how many orders they have placed, what they have actually paid, and when
 * they last bought. The customers table has none of them — they are facts
 * about Orders — so they are aggregated here rather than by the frontend,
 * which would need every order of every customer to do it.
 *
 * Money is summed in integer minor units and rendered as a fixed 2-decimal
 * string, like every other money value over this API: no float ever touches it.
 */

import { toMoneyString } from "../../common/money";

interface DecimalLike {
    toString(): string;
}

export interface CustomerDto {
    id: string;
    storeId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
    zipCode: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface CustomerListItemDto extends CustomerDto {
    /** Every order they have placed, paid or not. */
    orderCount: number;
    /**
     * What they have PAID, not what they have ordered: an unpaid order is not
     * money this business has. `null` when nothing has been paid.
     */
    spent: string | null;
    /** The currency `spent` is in; `null` when nothing has been paid. */
    currency: string | null;
    /**
     * True when their paid orders are not all in one currency. `spent` then
     * covers only the currency named above — the figure is a subset, and a
     * screen that shows it must say so rather than present it as the total.
     */
    mixedCurrency: boolean;
    /** When they last ordered — paid or not. `null` if they never have. */
    lastOrderAt: Date | null;
}

export interface RawCustomerOrder {
    total: DecimalLike;
    currency: string;
    paymentStatus: string;
    createdAt: Date;
}

export interface RawCustomer {
    id: string;
    storeId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
    zipCode: string | null;
    createdAt: Date;
    updatedAt: Date;
    orders: RawCustomerOrder[];
}

/** "1234.50" → 123450. Digits only, so the cent is never a float. */
function toMinor(value: DecimalLike): number {
    const raw = value.toString();
    const negative = raw.startsWith("-");
    const [whole, fraction = ""] = (negative ? raw.slice(1) : raw).split(".");
    const minor =
        Number(whole || "0") * 100 + Number((fraction + "00").slice(0, 2));
    return negative ? -minor : minor;
}

/** 123450 → "1234.50". */
function fromMinor(minor: number): string {
    const negative = minor < 0;
    const abs = Math.abs(minor);
    return toMoneyString(
        `${negative ? "-" : ""}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`,
    );
}

export function serializeCustomerListItem(
    customer: RawCustomer,
): CustomerListItemDto {
    const { orders, ...rest } = customer;
    // Newest first, so "last order" and "which currency" are the same
    // question: the one they most recently transacted in.
    const byNewest = [...orders].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const paid = byNewest.filter((o) => o.paymentStatus === "PAID");
    const currency = paid.length > 0 ? paid[0].currency : null;
    const inCurrency = paid.filter((o) => o.currency === currency);

    return {
        ...rest,
        orderCount: orders.length,
        spent:
            currency === null
                ? null
                : fromMinor(
                      inCurrency.reduce((sum, o) => sum + toMinor(o.total), 0),
                  ),
        currency,
        mixedCurrency: inCurrency.length !== paid.length,
        lastOrderAt: byNewest.length > 0 ? byNewest[0].createdAt : null,
    };
}
