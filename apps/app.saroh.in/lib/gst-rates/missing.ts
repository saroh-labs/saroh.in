import { count, plural } from "@/lib/format/plural";
import type { GstRateValue } from "@/lib/invoices/gst";

/**
 * A GST rate nobody chose (12 Oct 2026). Pure and client-safe.
 *
 * A GST-registered business's service or product with no rate is "not
 * set": a line that bills it is taxed at nothing, on a paper still titled
 * "Tax invoice". So where someone at the business takes a payment or issues
 * an invoice, the API refuses with 409 `{ reason: "GST_RATE_MISSING", items
 * }` and the app asks for each rate in the sheet that is open
 * (`use-gst-rate-step.tsx`), saves it and runs the same action again. A
 * customer paying on the site is never asked.
 *
 * 0% is a rate: "exempt or nil-rated" is a choice, never the same as none.
 */

export const GST_RATE_MISSING = "GST_RATE_MISSING";

/** A service, a product, or a line typed on an invoice by hand. */
export type RateItemKind = "SERVICE" | "PRODUCT" | "LINE";

const KINDS: readonly RateItemKind[] = ["SERVICE", "PRODUCT", "LINE"];

/** What has no rate: where it is saved (`kind`, `id`) and its name. */
export interface RateItem {
    kind: RateItemKind;
    /** The service's or product's id; a typed line's place, from 0. */
    id: string;
    name: string;
}

/** A row of the sheet: the item, and what the read says of it. */
export interface RateRow extends RateItem {
    /** Its price in minor units, GST included; absent on a refusal's item. */
    priceCents?: number;
    currency?: string | null;
    /** False when this person's role can't save it. Absent reads as true. */
    canSet?: boolean;
}

/** `GET …/gst-rates/missing`: priced things on sale with no GST rate. */
export interface MissingRates {
    /** The business issues tax invoices. False: nothing is asked of it. */
    registered: boolean;
    items: (RateRow & { kind: "SERVICE" | "PRODUCT" })[];
    /** More are missing than `items` lists. */
    more: boolean;
}

/**
 * The items a refusal names, from its `details`; undefined for any other
 * failure, so it is shown as it always was.
 */
export function rateItemsOf(details: unknown): RateItem[] | undefined {
    if (!details || typeof details !== "object") return undefined;
    const d = details as { reason?: unknown; items?: unknown };
    if (d.reason !== GST_RATE_MISSING || !Array.isArray(d.items)) {
        return undefined;
    }
    const items = d.items.flatMap((raw): RateItem[] => {
        const i = (raw ?? {}) as Partial<Record<keyof RateItem, unknown>>;
        const kind = KINDS.find((k) => k === i.kind);
        if (!kind || typeof i.id !== "string") return [];
        return [
            { kind, id: i.id, name: typeof i.name === "string" ? i.name : "" },
        ];
    });
    return items.length > 0 ? items : undefined;
}

/** One key per item, across kinds. */
export function rateKey(item: Pick<RateItem, "kind" | "id">): string {
    return `${item.kind}:${item.id}`;
}

/** The rate chosen for each item, by `rateKey`; "" is not chosen yet. */
export type RateChoices = Readonly<Record<string, GstRateValue>>;

/** A choice as the API takes it. */
export interface ChosenRate {
    kind: RateItemKind;
    id: string;
    rate: Exclude<GstRateValue, "">;
}

/** The choices made, in the rows' order. */
export function chosenRates(
    rows: readonly RateItem[],
    choices: RateChoices,
): ChosenRate[] {
    return rows.flatMap((row) => {
        const rate = choices[rateKey(row)] ?? "";
        return rate === "" ? [] : [{ kind: row.kind, id: row.id, rate }];
    });
}

/** The rows still with no rate chosen, of those this person can set. */
export function unchosen(
    rows: readonly RateRow[],
    choices: RateChoices,
): RateRow[] {
    return rows.filter(
        (row) => row.canSet !== false && (choices[rateKey(row)] ?? "") === "",
    );
}

/** A row's name, never blank. */
export function rowName(row: Pick<RateItem, "kind" | "name">): string {
    return row.name.trim() || (row.kind === "LINE" ? "This line" : "This");
}

/** What a row is, in a word, under its name. */
export function kindWord(kind: RateItemKind): string {
    if (kind === "SERVICE") return "Service";
    if (kind === "PRODUCT") return "Product";
    return "Invoice line";
}

/**
 * The line under the ask's title: what has no rate, and what happens once
 * it is chosen. `then` is the action that was started ("issue this
 * invoice", "take this payment").
 */
export function askWhy(items: readonly RateItem[], then: string): string {
    if (items.length === 1 && items[0]) {
        return `${rowName(items[0])} has no GST rate. Choose one to ${then}.`;
    }
    return `${count(items.length, "item")} have no GST rate. Choose one for each to ${then}.`;
}

/** Where the choice is kept, said under the rows. */
export function savedWhere(items: readonly RateItem[]): string {
    const lines = items.every((i) => i.kind === "LINE");
    const kept = lines
        ? "The rate is saved on this invoice."
        : items.length === 1 && items[0]?.kind === "SERVICE"
          ? "The rate is saved on the service, so you're asked once."
          : items.length === 1 && items[0]?.kind === "PRODUCT"
            ? "The rate is saved on the product, so you're asked once."
            : "Each rate is saved on its item, so you're asked once.";
    return `${kept} Prices include GST. Choose 0% for anything exempt or nil-rated.`;
}

/**
 * The notice's sentence: how many priced things on sale have no rate, by
 * kind. Null when nothing is missing, so the page draws no notice.
 */
export function missingLine(missing: MissingRates | null): string | null {
    if (!missing?.registered || missing.items.length === 0) return null;
    const services = missing.items.filter((i) => i.kind === "SERVICE").length;
    const products = missing.items.length - services;
    const parts = [
        services > 0 ? count(services, "service") : null,
        products > 0 ? count(products, "product") : null,
    ].filter((part): part is string => part !== null);
    const total = missing.items.length;
    const what = missing.more
        ? `More than ${parts.join(" and ")}`
        : parts.join(" and ");
    return `${what} ${plural(total, "has", "have")} no GST rate. Until you choose one, ${plural(total, "its", "their")} tax invoices show no GST.`;
}

/** What the list's sheet says once it has saved. */
export function savedMessage(n: number): string {
    return n === 1 ? "GST rate saved." : `${count(n, "GST rate")} saved.`;
}
