import { formatMoneyMajor } from "@/lib/format/money";
import { count } from "@/lib/format/plural";
import type { GstAsk } from "@/lib/gst/item-words";
import { addedGst, addedGstWords, gstChangeLines } from "@/lib/gst/item-words";
import { absentText } from "@saroh/ui/lib/absent";

import type { PackKind, PackServiceOption, PackValues } from "./pack-editor";
import {
    KIND_OPTIONS,
    normalPrice,
    priceAmount,
    unitOf,
    unitsOf,
} from "./pack-editor";

/*
 * The Pack Editor's words and figures (E18, Saroh Pack Editor.dc.html):
 * "When you publish", what the sold keep, the toast after Publish, and the
 * side column's per-class price, saving against drop-in and the rules note.
 * The rules they describe are in `pack-editor.ts`.
 */

// — "When you publish" —————————————————————————————————————————————————

function money(amount: string | null, currency: string): string {
    return formatMoneyMajor(normalPrice(amount), currency) ?? "no price";
}

/** One line per change a live pack is waiting to publish. */
export function packChanges(
    published: PackValues,
    values: PackValues,
): string[] {
    const units = unitsOf(values.kind);
    const out: string[] = [];
    if (priceAmount(published.price) !== priceAmount(values.price)) {
        out.push(
            `Price ${money(published.price, published.currency)} → ${money(values.price, values.currency)}`,
        );
    }
    if (published.credits !== values.credits) {
        out.push(
            `${published.credits ?? "none"} → ${values.credits ?? "none"} ${units}`,
        );
    }
    if (published.validityDays !== values.validityDays) {
        out.push(
            `use within ${published.validityDays ?? "no limit"} → ${values.validityDays ?? "no limit"} days`,
        );
    }
    if (published.name.trim() !== values.name.trim() && values.name.trim()) {
        out.push(`renamed to ${values.name.trim()}`);
    }
    if (published.kind !== values.kind) {
        const label = KIND_OPTIONS.find((o) => o.value === values.kind)?.label;
        out.push(`credits are for ${(label ?? "").toLowerCase()}`);
    }
    if (
        [...published.serviceIds].sort().join() !==
        [...values.serviceIds].sort().join()
    ) {
        out.push(
            `good for ${count(values.serviceIds.length, unitOf(values.kind), units)}`,
        );
    }
    if (published.firstPackOnly !== values.firstPackOnly) {
        out.push(values.firstPackOnly ? "first pack only" : "open to anyone");
    }
    if (
        (published.description ?? "").trim() !==
        (values.description ?? "").trim()
    ) {
        out.push("new description");
    }
    out.push(...gstChangeLines(published, values));
    return out;
}

/** Said after the changes when some are sold: they keep their terms. */
export function soldKeepNote(
    kind: PackKind,
    sold: number | null,
): string | null {
    if (!sold) return null;
    return `The ${sold} already sold keep their ${unitsOf(kind)}, price and dates.`;
}

/** The toast after Publish. */
export function publishedToast(
    values: PackValues,
    wasLive: boolean,
    sold: number | null,
): string {
    if (wasLive) {
        return sold
            ? `Changes published. The ${sold} already sold keep what they bought.`
            : "Changes published.";
    }
    return `${values.name.trim()} is published. You can sell it now.`;
}

// — The side column ————————————————————————————————————————————————————

/**
 * The drop-in prices of the chosen services, in the pack's currency: what
 * one visit costs to pay alone, GST and all (`PackServiceOption`).
 */
function dropIns(
    values: PackValues,
    services: readonly PackServiceOption[],
): number[] {
    return services
        .filter(
            (s) =>
                values.serviceIds.includes(s.id) &&
                s.priceCents !== null &&
                (s.currency ?? values.currency) === values.currency,
        )
        .map((s) => (s.priceCents ?? 0) / 100);
}

/**
 * What "GST is added" does to the price being typed, by the preview mirror
 * (`lib/gst/price-mode.ts`); null whenever the typed price is the amount
 * to pay. `gst` is the business's standing: without it nothing is added.
 */
function addedOf(values: PackValues, gst: GstAsk | null | undefined) {
    return addedGst(normalPrice(values.price), values, gst);
}

/**
 * One visit's share of what the pack costs to pay, GST and all, so it
 * compares with a drop-in, which is also what is paid.
 */
function perCredit(
    values: PackValues,
    gst: GstAsk | null | undefined,
): number | null {
    const price = priceAmount(values.price);
    if (!price || !values.credits) return null;
    const added = addedOf(values, gst);
    return (added ? added.payCents / 100 : price) / values.credits;
}

/**
 * "₹1,500 + ₹270 GST (18%) = ₹1,770 to pay", under the price while GST is
 * added to it. Null whenever the typed price is the amount to pay.
 */
export function priceToPay(
    values: PackValues,
    gst: GstAsk | null | undefined,
): string | null {
    const added = addedOf(values, gst);
    return added ? addedGstWords(added, values.currency) : null;
}

/**
 * "₹450 a class · drop-in ₹500–₹700", under the price. Both sides are
 * what is paid: where GST is added to the pack's price the share says so
 * ("₹531 a class with GST").
 */
export function eachNote(
    values: PackValues,
    services: readonly PackServiceOption[],
    gst: GstAsk | null = null,
): string {
    const each = perCredit(values, gst);
    if (each === null) return "";
    const m = (n: number) => formatMoneyMajor(Math.round(n), values.currency);
    const drops = dropIns(values, services);
    let text = `${m(each)} a ${unitOf(values.kind)}${addedOf(values, gst) ? " with GST" : ""}`;
    if (drops.length) {
        const lo = Math.min(...drops);
        const hi = Math.max(...drops);
        text += ` · drop-in ${lo === hi ? m(lo) : `${m(lo)} to ${m(hi)}`}`;
    }
    return text;
}

/**
 * At a glance: per class, the saving against drop-in, and sold so far. The
 * share and the drop-in are both what is paid, GST and all.
 */
export function glance(
    values: PackValues,
    services: readonly PackServiceOption[],
    sold: number | null,
    gst: GstAsk | null = null,
): [string, string][] {
    const each = perCredit(values, gst);
    const drops = dropIns(values, services);
    let saving = absentText();
    if (each !== null && drops.length) {
        const mid = (Math.min(...drops) + Math.max(...drops)) / 2;
        if (mid > 0) {
            saving = `${Math.max(0, Math.round(100 - (100 * each) / mid))}%`;
        }
    }
    return [
        [
            `Per ${unitOf(values.kind)}`,
            each === null
                ? absentText()
                : `${formatMoneyMajor(Math.round(each), values.currency)}${addedOf(values, gst) ? " with GST" : ""}`,
        ],
        ["Saving vs drop-in", saving],
        ["Sold so far", sold === null ? absentText() : String(sold)],
    ];
}

/** The note under the side column. */
export function packRules(kind: PackKind): string {
    return `Unused ${unitsOf(kind)} end with the pack. You can extend someone's use-by date by up to 30 days from the pack's page.`;
}
