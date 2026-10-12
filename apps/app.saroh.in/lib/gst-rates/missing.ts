import { count, plural } from "@/lib/format/plural";
import type { GstAsk } from "@/lib/gst/item-words";
import type { GstPriceMode } from "@/lib/gst/price-mode";
import {
    effectiveMode,
    isGstPriceMode,
    pricesCarryGst,
    rateBps,
    unitPayCents,
} from "@/lib/gst/price-mode";
import type { GstRateValue } from "@/lib/invoices/gst";
import type { RenewalChange } from "@/lib/subscriptions/renewal-change";
import { renewalChangeLines } from "@/lib/subscriptions/renewal-change";

/**
 * A GST rate nobody chose (12 Oct 2026). Pure and client-safe.
 *
 * A GST-registered business's service, product, membership plan, class
 * pack or course with no rate is "not set": a line that bills it is taxed
 * at nothing, on a paper still titled "Tax invoice". So where someone at
 * the business takes a payment, issues an invoice, puts someone on a plan,
 * sells a pack or enrols someone on a course, the API refuses with 409
 * `{ reason: "GST_RATE_MISSING", items }` and the app asks for each rate in
 * the sheet that is open (`use-gst-rate-step.tsx`), saves it and runs the
 * same action again. A customer paying on the site is never asked, and a
 * member's renewal is never stopped for it.
 *
 * 0% is a rate: "exempt or nil-rated" is a choice, never the same as none.
 */

export const GST_RATE_MISSING = "GST_RATE_MISSING";

/** What is sold with a rate of its own, saved on it. */
export type SoldKind = "SERVICE" | "PRODUCT" | "PLAN" | "PACK" | "COURSE";

/** Something sold, or a line typed on an invoice by hand. */
export type RateItemKind = SoldKind | "LINE";

const SOLD_KINDS: readonly SoldKind[] = [
    "SERVICE",
    "PRODUCT",
    "PLAN",
    "PACK",
    "COURSE",
];

const KINDS: readonly RateItemKind[] = [...SOLD_KINDS, "LINE"];

/** People on a plan now who pay one price: "2000.00". */
export interface PlanMembers {
    count: number;
    price: string;
    currency: string;
}

/** What has no rate: where it is saved (`kind`, `id`) and its name. */
export interface RateItem {
    kind: RateItemKind;
    /** The id of what is sold; a typed line's place, from 0. */
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
    /**
     * How this item's own price carries GST, when that is not the
     * business's way. Absent: the business's.
     */
    priceMode?: GstPriceMode;
    /**
     * A plan's members now, by the price each pays: their next renewal
     * carries the rate once it is chosen. Absent on every other kind, on a
     * plan nobody is on, and on a refusal's item.
     */
    members?: PlanMembers[];
}

/** `GET …/gst-rates/missing`: priced things on sale with no GST rate. */
export interface MissingRates {
    /** The business issues tax invoices. False: nothing is asked of it. */
    registered: boolean;
    items: (RateRow & { kind: SoldKind })[];
    /** More are missing than `items` lists. */
    more: boolean;
    /**
     * How a registered business's prices carry GST (12 Oct 2026), where it
     * could be told: the read's own, else the business's settings. Null or
     * absent when it couldn't, and nothing is then said of it.
     */
    priceMode?: GstPriceMode | null;
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

const KIND_WORD: Record<RateItemKind, string> = {
    SERVICE: "Service",
    PRODUCT: "Product",
    PLAN: "Plan",
    PACK: "Class pack",
    COURSE: "Course",
    LINE: "Invoice line",
};

/** What a row is, in a word, under its name. */
export function kindWord(kind: RateItemKind): string {
    return KIND_WORD[kind];
}

/** A list in a sentence: "a", "a and b", "a, b and c". */
function listed(parts: readonly string[]): string {
    if (parts.length <= 1) return parts.join("");
    return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1) ?? ""}`;
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

/**
 * Where the choice is kept, said under the rows, with how the prices carry
 * GST. A line typed on an invoice is always charged as typed, GST included.
 * Anything sold follows the business's choice (`mode`), and where that
 * couldn't be told (`null`) nothing is said of it. A plan's rate reaches
 * the members already on it: the sentence says so, since a refusal's item
 * doesn't say who they are.
 */
export function savedWhere(
    items: readonly RateItem[],
    mode: GstPriceMode | null = "INCLUDED",
): string {
    const lines = items.every((i) => i.kind === "LINE");
    const kept = lines
        ? "The rate is saved on this invoice."
        : items.length === 1 && items[0]
          ? `The rate is saved on the ${kindWord(items[0].kind).toLowerCase()}, so you're asked once.`
          : "Each rate is saved on its item, so you're asked once.";
    const plans = items.filter((i) => i.kind === "PLAN").length;
    return [
        kept,
        plans > 0
            ? `Members already on ${plans === items.length && plans === 1 ? "this plan" : "a plan"} carry its rate from their next renewal. Invoices already issued don't change.`
            : "",
        pricesCarryGst(lines ? "INCLUDED" : mode),
        "Choose 0% for anything exempt or nil-rated.",
    ]
        .filter((sentence) => sentence !== "")
        .join(" ");
}

/**
 * The notice's sentence: how many priced things on sale have no rate, by
 * kind. Null when nothing is missing, so the page draws no notice.
 */
export function missingLine(missing: MissingRates | null): string | null {
    if (!missing?.registered || missing.items.length === 0) return null;
    const of = (kind: SoldKind) =>
        missing.items.filter((i) => i.kind === kind).length;
    const parts = (
        [
            ["SERVICE", "service", "services"],
            ["PRODUCT", "product", "products"],
            ["PLAN", "plan", "plans"],
            ["PACK", "class pack", "class packs"],
            ["COURSE", "course", "courses"],
        ] as const
    ).flatMap(([kind, one, many]) => {
        const n = of(kind);
        return n > 0 ? [count(n, one, many)] : [];
    });
    const total = missing.items.length;
    const what = missing.more ? `More than ${listed(parts)}` : listed(parts);
    return `${what} ${plural(total, "has", "have")} no GST rate. Until you choose one, ${plural(total, "its", "their")} tax invoices show no GST.`;
}

/** The list's sheet: the line under its title, by how prices carry GST. */
export function listWhy(mode: GstPriceMode | null): string {
    const choose =
        mode === null
            ? "Choose each one's rate."
            : mode === "ADDED"
              ? "Choose the rate added to each price."
              : "Choose the rate each price includes.";
    return `These are on sale with a price and no GST rate. ${choose}`;
}

/** The list's sheet: the line under its rows. */
export function listNote(mode: GstPriceMode | null, more: boolean): string {
    if (more) {
        return "There are more than this list holds. Save these and the rest are listed next. Choose 0% for anything exempt or nil-rated.";
    }
    return [pricesCarryGst(mode), "Choose 0% for anything exempt or nil-rated."]
        .filter((sentence) => sentence !== "")
        .join(" ");
}

/** What the list's sheet says once it has saved. */
export function savedMessage(n: number): string {
    return n === 1 ? "GST rate saved." : `${count(n, "GST rate")} saved.`;
}

/* ── A plan's members, in the sheet ────────────────────────────────── */

/** "2000.00" as 200000: whole paise, never a float sum. */
function minorOf(amount: string): number | null {
    const match = /^(\d+)(?:\.(\d*))?$/.exec(amount.trim());
    if (!match) return null;
    const [, whole = "0", frac = ""] = match;
    return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

const majorOf = (cents: number) => (cents / 100).toFixed(2);

/**
 * What saving `rate` on a plan does to the next renewal of the members on
 * it now, as the Plan Editor's read would say it: by the preview mirror in
 * `lib/gst/price-mode.ts`, under the plan's own mode or the business's.
 * Null for a row with nobody on it, with no rate chosen yet, or where how
 * the price carries GST couldn't be told (the sentence then says only that
 * they carry the rate).
 */
export function membersChange(
    row: Pick<RateRow, "members" | "priceMode">,
    rate: GstRateValue,
    business: GstPriceMode | null,
): RenewalChange | null {
    const members = (row.members ?? []).filter((m) => m.count > 0);
    if (members.length === 0 || rate === "") return null;
    if (business === null && !isGstPriceMode(row.priceMode)) return null;
    const mode = effectiveMode(business, row.priceMode);
    const groups = members.flatMap((m) => {
        const from = minorOf(m.price);
        if (from === null) return [];
        return [
            {
                members: m.count,
                currency: m.currency,
                from: majorOf(from),
                to: majorOf(unitPayCents(from, rate, mode, true)),
            },
        ];
    });
    if (groups.length === 0) return null;
    return {
        members: groups.reduce((n, g) => n + g.members, 0),
        groups,
        changed: groups
            .filter((g) => g.from !== g.to)
            .reduce((n, g) => n + g.members, 0),
        // Autopay limits aren't part of this read: the editor's is.
        aboveAutopayLimit: 0,
    };
}

/**
 * The lines under a plan's row once its rate is chosen: how many members'
 * next renewal changes and from what to what, or that it stays the same
 * amount with the GST shown inside. None for anything but a plan with
 * members, and none before a rate is chosen.
 */
export function membersLines(
    row: Pick<RateRow, "kind" | "members" | "priceMode">,
    rate: GstRateValue,
    business: GstPriceMode | null,
): string[] {
    if (row.kind !== "PLAN" || rate === "") return [];
    const on = (row.members ?? []).reduce((n, m) => n + m.count, 0);
    if (on <= 0) return [];
    const change = membersChange(row, rate, business);
    if (!change) {
        return [
            `${count(on, "member carries", "members carry")} this rate from their next renewal.`,
        ];
    }
    return renewalChangeLines(change, { gstInside: (rateBps(rate) ?? 0) > 0 });
}

/**
 * Whether the business is asked for GST, and its own way of carrying it,
 * as the missing-rates read says. Unread (`null`) asks for nothing.
 */
export function gstAskOf(missing: MissingRates | null | undefined): GstAsk {
    return {
        asked: missing?.registered === true,
        priceMode: missing?.priceMode ?? null,
    };
}
