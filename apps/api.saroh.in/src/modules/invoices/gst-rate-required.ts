import { ConflictException } from "@nestjs/common";

/**
 * A tax invoice a member of staff starts never goes out with a rate that
 * was never chosen (12 Oct 2026).
 *
 * A GST-registered business's line whose item has no GST rate is "not
 * set" (D15, DEC-072): it is taxed at nothing, yet the paper is still
 * titled "Tax invoice". So when someone at the business takes a payment or
 * issues an invoice and a line's item has no rate, the write is refused
 * with a 409 that names the items (`{ reason: "GST_RATE_MISSING", items }`)
 * and the app asks for each rate in place, saves it to the item and runs
 * the same action again (`use-gst-rate-step.tsx`).
 *
 * **Never on a path a customer or a job starts.** Paper written because a
 * customer paid on the business's site, or a renewal ran, is written as
 * before: nobody is there to choose a rate, and a payment is never failed
 * for it. The missing-rates read (`gst-rates.service.ts`) is how the
 * business finds those items first.
 *
 * 0 is a rate: "Exempt (0%)" is a choice, and a paper whose every line is
 * 0 is a bill of supply (`invoice-title.ts`). Only null is "not set".
 */

export const GST_RATE_MISSING = "GST_RATE_MISSING";

/**
 * What a line bills: a service or a product, whose rate is saved on it, or
 * a line typed on an invoice by hand, whose rate is the line's own.
 */
export type RateItemKind = "SERVICE" | "PRODUCT" | "LINE";

export interface RateItem {
    kind: RateItemKind;
    /** The service's or product's id; a typed line's place, from 0. */
    id: string;
    name: string;
}

/** A line as a writer has it: what it bills, and the rate that carries. */
export interface RatedLine extends RateItem {
    rate: { toString(): string } | string | number | null | undefined;
}

/** The lines with no rate chosen, each item once, in the paper's order. */
export function unratedOf(lines: readonly RatedLine[]): RateItem[] {
    const seen = new Set<string>();
    const items: RateItem[] = [];
    for (const line of lines) {
        if (line.rate !== null && line.rate !== undefined) continue;
        const key = `${line.kind}:${line.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ kind: line.kind, id: line.id, name: line.name });
    }
    return items;
}

function joinAnd(names: readonly string[]): string {
    if (names.length <= 1) return names[0] ?? "";
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The refusal's words, for a toast where the app has no step to offer. */
export function gstRateMessage(items: readonly RateItem[]): string {
    const names = items.map((i) => i.name.trim() || "A line");
    if (names.length === 1) {
        return `${names[0]} has no GST rate. Choose one to issue this invoice.`;
    }
    if (names.length > 3) {
        return `${names.length} items have no GST rate. Choose one for each to issue this invoice.`;
    }
    return `${joinAnd(names)} have no GST rate. Choose one for each to issue this invoice.`;
}

export function gstRateMissing(items: readonly RateItem[]): ConflictException {
    return new ConflictException({
        message: gstRateMessage(items),
        details: { reason: GST_RATE_MISSING, items: [...items] },
    });
}

/**
 * Refuse a tax invoice with a line whose rate was never chosen. `registered`
 * is whether the paper about to be written is a registered business's: the
 * tax profile's for a new invoice, the original's frozen GSTIN for one
 * written against it. Never call it on a path a customer or a job starts.
 */
export function assertRatesSet(
    registered: boolean,
    lines: readonly RatedLine[],
): void {
    if (!registered) return;
    const items = unratedOf(lines);
    if (items.length > 0) throw gstRateMissing(items);
}
