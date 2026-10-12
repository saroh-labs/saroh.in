import { formatMoneyMajor } from "@/lib/format/money";
import { modeSays, rateSays } from "@/lib/gst/item-words";
import { ITEM_MODE_LABEL } from "@/lib/gst/price-mode";
import type { PriceChange, PriceField } from "@/lib/price-history/words";
import { isPriceField } from "@/lib/price-history/words";
import { productHref } from "@/lib/products/links";

import { record, text } from "./activity-changes";

/**
 * Settings › Activity's words for a change to what something costs
 * (`price.changed`, owner 12 Oct 2026): "changed the price of Rye loaf from
 * ₹780 to ₹820", linking to the product, the service or the course. The
 * same entries are an item's own Price history
 * (`lib/price-history/words.ts`), said there as short lines.
 *
 * A price is the one that was typed. Nothing here works out an amount to
 * pay. An item's first entry (`price.set`: it was made, copied or imported)
 * is its own history's and is not told here, or one import would fill the
 * page.
 *
 * The rates sheet used to write `gst-rate.set` (one `from` and `to`):
 * `activity.ts` and `activity-detail.ts` still read those rows as they
 * always did, and they link to the same places ({@link pricedPlace}).
 */

/** The changes a `price.changed` row recorded, in the order it kept them. */
export function priceChangesOf(
    meta: Record<string, unknown>,
): (PriceChange & { field: PriceField })[] {
    if (!Array.isArray(meta.changes)) return [];
    return meta.changes.flatMap((c) => {
        const change = record(c);
        const before = text(change.before);
        const after = text(change.after);
        return isPriceField(change.field) && before !== after
            ? [{ field: change.field, before, after }]
            : [];
    });
}

/** What the item is called in a sentence: an option after its product. */
function itemSaid(meta: Record<string, unknown>): string {
    const name = text(meta.name);
    const option = text(record(meta.option).title);
    const kind = { SERVICE: "a service", COURSE: "a course" }[
        text(meta.kind) ?? ""
    ];
    const item = name ?? kind ?? "a product";
    return option ? `${item} (${option})` : item;
}

/** A field as the tail of a sentence names it: "and its MRP and GST rate". */
const ALSO: Record<PriceField, string> = {
    price: "price",
    mrp: "MRP",
    gstRate: "GST rate",
    gstPriceMode: "GST on its price",
};

/** "A", "A and B", "A, B and C". */
function listed(words: readonly string[]): string {
    if (words.length <= 1) return words.join("");
    return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** One change as the rest of a sentence, after the person's name. */
function changeSaid(
    change: PriceChange & { field: PriceField },
    item: string,
    currency: string | null,
    option: boolean,
): string {
    const { before, after } = change;
    const money = (amount: string) => formatMoneyMajor(amount, currency);
    switch (change.field) {
        case "price":
        case "mrp": {
            const what = change.field === "price" ? "price" : "MRP";
            if (after === null) {
                return option
                    ? `set ${item} back to the product's ${what}`
                    : `removed the ${what} of ${item}`;
            }
            return before === null
                ? `set the ${what} of ${item} to ${money(after)}`
                : `changed the ${what} of ${item} from ${money(before)} to ${money(after)}`;
        }
        case "gstRate":
            if (after === null) return `removed the GST rate of ${item}`;
            return before === null
                ? `set the GST rate of ${item} to ${rateSays(after)}`
                : `changed the GST rate of ${item} from ${rateSays(before)} to ${rateSays(after)}`;
        case "gstPriceMode":
            return `changed GST on the price of ${item} to ${modeSays(after)}`;
    }
}

/**
 * A `price.changed` row as the rest of a sentence. One change is said
 * whole; a save that moved several says the first whole and names the
 * rest: "changed the price of Rye loaf from ₹780 to ₹820, and its MRP and
 * GST rate". The sheet the row opens lists each with its values.
 */
export function priceWhat(meta: Record<string, unknown>): string {
    const item = itemSaid(meta);
    const changes = priceChangesOf(meta);
    if (changes.length === 0) return `changed what ${item} costs`;
    const [first, ...rest] = changes;
    const said = changeSaid(
        first,
        item,
        text(meta.currency),
        text(record(meta.option).title) !== null,
    );
    return rest.length === 0
        ? said
        : `${said}, and its ${listed(rest.map((c) => ALSO[c.field]))}`;
}

/** Where a priced thing lives: its own page, or its list. */
export function pricedPlace(
    id: string | null,
    meta: Record<string, unknown>,
): { label: string; href: string } {
    const name = text(meta.name);
    switch (text(meta.kind)) {
        case "SERVICE":
            return {
                label: name ?? "Services",
                href: id ? `/services/${id}` : "/services",
            };
        case "COURSE":
            return {
                label: name ?? "Courses",
                href: id ? `/courses/${id}` : "/courses",
            };
        default:
            return id
                ? { label: name ?? "Product", href: productHref(null, id) }
                : { label: "Products", href: "/commerce/products" };
    }
}

const KIND_LABEL: Partial<Record<string, string>> = {
    SERVICE: "Service",
    COURSE: "Course",
};

const FIELD_LABEL: Record<PriceField, string> = {
    price: "Price",
    mrp: "MRP",
    gstRate: "GST rate",
    gstPriceMode: ITEM_MODE_LABEL,
};

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The sheet's rows for a `price.changed` row: what it was about, then each
 * field as it was and as it became. A field with none reads "Not set"; an
 * option with no price or MRP of its own, "Same as the product".
 */
export function priceRows(
    meta: Record<string, unknown>,
): { label: string; before: string | null; after: string | null }[] {
    const currency = text(meta.currency);
    const option = text(record(meta.option).title);
    const shown = (field: PriceField, value: string | null): string => {
        if (field === "gstPriceMode") return capitalise(modeSays(value));
        if (field === "gstRate") return capitalise(rateSays(value));
        if (value === null) {
            return option ? "Same as the product" : "Not set";
        }
        return formatMoneyMajor(value, currency);
    };
    const name = text(meta.name);
    return [
        ...(name
            ? [
                  {
                      label: KIND_LABEL[text(meta.kind) ?? ""] ?? "Product",
                      before: null,
                      after: name,
                  },
              ]
            : []),
        ...(option ? [{ label: "Option", before: null, after: option }] : []),
        ...priceChangesOf(meta).map((change) => ({
            label: FIELD_LABEL[change.field],
            before: shown(change.field, change.before),
            after: shown(change.field, change.after),
        })),
    ];
}
