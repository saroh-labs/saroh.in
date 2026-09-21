import type { CustomerListItem } from "./service";

/** One storefront a person has bought from, and their record there. */
export interface CustomerPlace {
    storeId: string;
    storeName: string;
    customer: CustomerListItem;
}

/**
 * One person in the business's customer list.
 *
 * Customers are stored per storefront (`@@unique([storeId, email])`), but a
 * person who buys from two of a business's storefronts is one person — the
 * workspace design says it outright: customers belong to the business, and a
 * storefront is a filter on that list, not a scope with its own. So rows are
 * merged by email, their orders and spend added up, and the storefronts they
 * bought from carried on the row.
 *
 * Money is only added where it is the same currency. Where someone has paid in
 * two, the row says so instead of inventing an exchange rate — the same rule
 * the API follows within one storefront.
 */
export interface DirectoryRow {
    key: string;
    email: string;
    /** Their name where they gave one; otherwise the email is the name. */
    name: string;
    orderCount: number;
    /** Summed across storefronts in `currency`; `null` when nothing is paid. */
    spent: string | null;
    currency: string | null;
    /** Their payments are not all in one currency, so `spent` is a subset. */
    mixedCurrency: boolean;
    /** ISO date of their most recent order anywhere; `null` if never. */
    lastOrderAt: string | null;
    places: CustomerPlace[];
}

type Places = [CustomerPlace, ...CustomerPlace[]];

export function mergeCustomers(
    stores: { id: string; name: string }[],
    customersByStore: Record<string, CustomerListItem[]>,
): DirectoryRow[] {
    const groups = new Map<string, Places>();
    for (const store of stores) {
        for (const customer of customersByStore[store.id] ?? []) {
            const key = customer.email.trim().toLowerCase();
            const place = {
                storeId: store.id,
                storeName: store.name,
                customer,
            };
            const seen = groups.get(key);
            if (seen) seen.push(place);
            else groups.set(key, [place]);
        }
    }
    return Array.from(groups.entries(), ([key, places]) =>
        toRow(key, places),
    ).sort(byMostRecent);
}

/** The same person seen from one storefront: what they did THERE. */
export function inStorefront(
    row: DirectoryRow,
    storeId: string,
): DirectoryRow | null {
    const here = row.places.filter((p) => p.storeId === storeId);
    const first = here.at(0);
    if (!first) return null;
    return {
        // The row keeps every place it belongs to: "also buys at" is a fact
        // about the person, not about the filter being applied.
        ...toRow(row.key, [first, ...here.slice(1)]),
        places: row.places,
    };
}

/** Most recent buyers first; someone who has never ordered sorts last. */
function byMostRecent(a: DirectoryRow, b: DirectoryRow): number {
    if (a.lastOrderAt === b.lastOrderAt) return a.name.localeCompare(b.name);
    if (a.lastOrderAt === null) return 1;
    if (b.lastOrderAt === null) return -1;
    return a.lastOrderAt < b.lastOrderAt ? 1 : -1;
}

function toRow(key: string, places: Places): DirectoryRow {
    const first = places[0].customer;
    const paid = places.filter((p) => p.customer.currency !== null);
    const currency = paid[0]?.customer.currency ?? null;
    const inCurrency = paid.filter((p) => p.customer.currency === currency);
    return {
        key,
        email: first.email,
        name: nameOf(first) ?? first.email,
        orderCount: places.reduce((n, p) => n + p.customer.orderCount, 0),
        spent:
            currency === null
                ? null
                : sumMoney(inCurrency.map((p) => p.customer.spent ?? "0.00")),
        currency,
        mixedCurrency:
            inCurrency.length !== paid.length ||
            places.some((p) => p.customer.mixedCurrency),
        lastOrderAt: places.reduce<string | null>(
            (latest, p) =>
                p.customer.lastOrderAt !== null &&
                (latest === null || p.customer.lastOrderAt > latest)
                    ? p.customer.lastOrderAt
                    : latest,
            null,
        ),
        places,
    };
}

function nameOf(customer: CustomerListItem): string | null {
    const name = [customer.firstName, customer.lastName]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(" ");
    return name.length > 0 ? name : null;
}

/**
 * Money strings added as integer minor units, never as floats — the same rule
 * the API follows. This is a display sum across storefronts, not a figure
 * anything is charged against.
 */
function sumMoney(values: string[]): string {
    const minor = values.reduce((total, value) => {
        const [whole = "0", fraction = ""] = value.split(".");
        return (
            total + Number(whole) * 100 + Number((fraction + "00").slice(0, 2))
        );
    }, 0);
    return `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}
