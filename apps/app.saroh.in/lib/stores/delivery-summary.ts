import { formatMoneyMajor } from "@/lib/format/money";

import type { StorefrontFulfilmentType } from "./fulfilment-types";
import { STOREFRONT_FULFILMENT_TYPES } from "./fulfilment-types";
import type { LateUnit } from "./late-after";
import {
    DEFAULT_LATE_AFTER,
    FULFILMENT_LABEL,
    lateAfterField,
    lateAfterMinutes,
    lateAfterWords,
    ORDERS_NOUN,
} from "./late-after";
import { pickupHasPlace, savedWays } from "./location-readiness";
import type { StorefrontInput, StorefrontSettings } from "./storefronts";

/**
 * Location › Delivery, read then edited one way at a time (the 9 Oct second
 * pass): the sentence each way's row says, the draft its Edit panel holds,
 * and the one update its Save sends. Pure, so the rules are tested without
 * a screen.
 */

type Way = StorefrontFulfilmentType;
type Paid = "LOCAL_DELIVERY" | "SHIPPING";

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

type Store = Pick<
    StorefrontSettings,
    | "kind"
    | "address"
    | "currency"
    | "fulfilmentTypes"
    | "collectionEnabled"
    | "shippingEnabled"
    | "lateAfterMinutes"
    | "localDeliveryFee"
    | "shippingFee"
    | "freeShippingThreshold"
    | "siteShop"
>;

/**
 * "Mark late after" presets. Late is minutes after the order is placed
 * (DEC-045), so "Same day" has no fixed length and isn't offered: 8 h
 * stands in for the end of a working day, and Other… takes anything else.
 */
export const LATE_PRESETS: readonly { minutes: number; label: string }[] = [
    { minutes: 120, label: "2 h" },
    { minutes: 240, label: "4 h" },
    { minutes: 480, label: "8 h" },
    { minutes: 1440, label: "24 h" },
    { minutes: 2880, label: "2 days" },
];

/** "2 h", "24 h", "2 days", "90 min": a late time in a row's few words. */
export function lateShort(minutes: number): string {
    if (minutes >= 2880 && minutes % 1440 === 0) {
        return `${minutes / 1440} days`;
    }
    if (minutes % 60 === 0) return `${minutes / 60} h`;
    return `${minutes} min`;
}

/** Whether a way can carry a website fee: a delivery, while the shop is open. */
export function paidWay(store: Store, type: Way): Paid | null {
    return type === "PICKUP" || !store.siteShop ? null : type;
}

export function savedFee(store: Store, type: Way): string | null {
    if (type === "LOCAL_DELIVERY") return store.localDeliveryFee ?? null;
    if (type === "SHIPPING") return store.shippingFee ?? null;
    return null;
}

const money = (amount: string, currency: string) =>
    formatMoneyMajor(amount, currency) ?? amount;

function lateOf(store: Store, type: Way): number {
    return (store.lateAfterMinutes ?? DEFAULT_LATE_AFTER)[type];
}

/**
 * What a way's row says, read only:
 *
 * - "Off";
 * - "₹40 · free over ₹999 · late after 24 h" (a fee while the online shop
 *   is open; the location-wide free-over amount only beside a fee);
 * - "Free · late after 2 days";
 * - "On · late after 2 h" while there is no online shop, so no fee to say;
 * - Pick-up where customers can't visit: "Not offered", and `note` says
 *   why; already on there (saved before): what it is, and that the website
 *   leaves it out.
 */
export interface WaySummary {
    /** The sentence in the row. */
    text: string;
    /** A second line: why the website leaves it out. */
    note: string | null;
    /** Pick-up where nobody can collect: no Edit, and its way forward. */
    notOffered: boolean;
    /** On, but nobody can collect (saved before): offer turning it off. */
    stranded: boolean;
    /** The way forward the note links to: a counter, or its address. */
    fix: "counter" | "address" | null;
}

export function waySummary(store: Store, type: Way): WaySummary {
    const on = savedWays(store).includes(type);
    const pickup = type === "PICKUP";
    const counter = store.kind === "SHOP";
    if (pickup && !counter && !on) {
        return {
            text: "Not offered",
            note: "Customers can't visit this location.",
            notOffered: true,
            stranded: false,
            fix: "counter",
        };
    }
    if (!on) {
        return {
            text: "Off",
            note: null,
            notOffered: false,
            stranded: false,
            fix: null,
        };
    }
    const parts: string[] = [];
    const fee = savedFee(store, type);
    if (store.siteShop) {
        if (paidWay(store, type) && fee) {
            parts.push(money(fee, store.currency));
            if (store.freeShippingThreshold) {
                parts.push(
                    `free over ${money(store.freeShippingThreshold, store.currency)}`,
                );
            }
        } else {
            parts.push("Free");
        }
    } else {
        parts.push("On");
    }
    parts.push(`late after ${lateShort(lateOf(store, type))}`);
    const note =
        pickup && !counter
            ? "Not on your website: customers can't visit this location."
            : pickup && !pickupHasPlace(store)
              ? "Not on your website until the address is added."
              : null;
    return {
        text: parts.join(" · "),
        note,
        notOffered: false,
        stranded: pickup && !counter,
        fix: pickup && counter && note ? "address" : null,
    };
}

/** What an Edit panel holds until Save or Cancel. */
export interface WayDraft {
    on: boolean;
    /** "What customers pay": Charge, or Free. */
    charge: boolean;
    fee: string;
    /** The location's one free-over amount (DEC-117); "" is always charge. */
    threshold: string;
    /** A preset's minutes, or null for Other… */
    preset: number | null;
    amount: string;
    unit: LateUnit;
}

export function wayDraft(store: Store, type: Way): WayDraft {
    const fee = savedFee(store, type);
    const minutes = lateOf(store, type);
    const preset = LATE_PRESETS.find((p) => p.minutes === minutes);
    const field = lateAfterField(minutes);
    return {
        on: savedWays(store).includes(type),
        charge: Boolean(fee),
        fee: fee ? String(Number(fee)) : "",
        threshold: store.freeShippingThreshold
            ? String(Number(store.freeShippingThreshold))
            : "",
        preset: preset ? preset.minutes : null,
        amount: field.amount,
        unit: field.unit,
    };
}

/** The draft's late time in minutes, or why it can't be saved. */
export function draftLate(
    draft: WayDraft,
): { ok: true; minutes: number } | { ok: false; error: string } {
    return draft.preset !== null
        ? { ok: true, minutes: draft.preset }
        : lateAfterMinutes(draft.amount, draft.unit);
}

export interface DraftProblems {
    fee?: string;
    threshold?: string;
    late?: string;
}

/** What must be fixed before Save, field by field. Empty when none. */
export function draftProblems(
    store: Store,
    type: Way,
    draft: WayDraft,
): DraftProblems {
    if (!draft.on) return {};
    const out: DraftProblems = {};
    if (paidWay(store, type) && draft.charge) {
        const fee = draft.fee.trim();
        if (!MONEY_RE.test(fee) || Number(fee) === 0) {
            out.fee =
                "Enter what customers pay, like 40 or 49.50, or choose Free.";
        }
        const over = draft.threshold.trim();
        if (over !== "" && !MONEY_RE.test(over)) {
            out.threshold = "A number with up to 2 decimals, or empty.";
        }
    }
    const late = draftLate(draft);
    if (!late.ok) out.late = `${late.error} Between 5 minutes and 30 days.`;
    return out;
}

const sameMoney = (a: string | null, b: string | null) =>
    a === null || b === null ? a === b : Number(a) === Number(b);

/**
 * The one update an Edit panel's Save sends: only what changed, with the
 * same fields the page always saved (`fulfilmentTypes`, the way's fee,
 * `freeShippingThreshold`, `lateAfterMinutes`). Turned off, only the ways
 * change: the fee and late time are kept for when it comes back.
 */
export function wayInput(
    store: Store,
    type: Way,
    draft: WayDraft,
): StorefrontInput {
    const input: StorefrontInput = {};
    const ways = savedWays(store);
    if (draft.on !== ways.includes(type)) {
        input.fulfilmentTypes = STOREFRONT_FULFILMENT_TYPES.filter((t) =>
            t === type ? draft.on : ways.includes(t),
        );
    }
    if (!draft.on) return input;

    const paid = paidWay(store, type);
    if (paid) {
        const fee = draft.charge ? draft.fee.trim() : null;
        if (!sameMoney(fee, savedFee(store, type))) {
            if (paid === "LOCAL_DELIVERY") input.localDeliveryFee = fee;
            else input.shippingFee = fee;
        }
        if (draft.charge) {
            const over = draft.threshold.trim() || null;
            if (!sameMoney(over, store.freeShippingThreshold)) {
                input.freeShippingThreshold = over;
            }
        }
    }
    const late = draftLate(draft);
    if (late.ok && late.minutes !== lateOf(store, type)) {
        input.lateAfterMinutes = { [type]: late.minutes };
    }
    return input;
}

/** The toast for a save, in the words each change has always used. */
export function waySaved(type: Way, input: StorefrontInput): string {
    const label = FULFILMENT_LABEL[type];
    const keys = Object.keys(input);
    if (keys.length === 1 && input.fulfilmentTypes) {
        return `${label} turned ${input.fulfilmentTypes.includes(type) ? "on" : "off"}`;
    }
    const late = input.lateAfterMinutes?.[type];
    if (keys.length === 1 && late !== undefined) {
        const noun = ORDERS_NOUN[type];
        return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} now count as late after ${lateAfterWords(late)}`;
    }
    return `${label} saved`;
}

/**
 * "At checkout: Local delivery · ₹40, free over ₹999": what a customer
 * sees on the website for the draft, as it is typed. Null with no online
 * shop, where there is no checkout to speak of.
 */
export function checkoutLine(
    store: Store,
    type: Way,
    draft: WayDraft,
): string | null {
    if (!store.siteShop) return null;
    const label = FULFILMENT_LABEL[type];
    if (!draft.on) return `At checkout: ${label} isn't offered.`;
    if (type === "PICKUP" && !pickupHasPlace(store)) {
        return "At checkout: not offered until customers can visit, at an address.";
    }
    const fee = draft.fee.trim();
    if (!paidWay(store, type) || !draft.charge || !MONEY_RE.test(fee)) {
        return `At checkout: ${label} · Free`;
    }
    const over = draft.threshold.trim();
    return `At checkout: ${label} · ${money(fee, store.currency)}${
        over && MONEY_RE.test(over)
            ? `, free over ${money(over, store.currency)}`
            : ""
    }`;
}

/** "Also applies to shipping." for the location's one free-over amount. */
export function thresholdScope(type: Way): string {
    return type === "LOCAL_DELIVERY"
        ? "Also applies to shipping."
        : "Also applies to local delivery.";
}
