import { accountMoney } from "../account/model";
import type { GstOnPrice } from "../lib/gst-price";
import {
    browsePriceWords,
    gstOnPriceOf,
    payPriceWords,
} from "../lib/gst-price";

/**
 * How a class pack is said on a site (G20): what the public packs read
 * serves, narrowed, and the card's lines. Pure, so the Class packs block
 * and its tests share one wording.
 */

/** A pack as the public packs read serves it. */
export interface PublicPack {
    id: string;
    name: string;
    description: string | null;
    credits: number;
    validityDays: number;
    /** A decimal string, e.g. "4500.00". */
    price: string;
    currency: string;
    kind: "CLASSES" | "ONE_TO_ONE";
    /** One visit's price to compare with, or null. */
    singlePrice: string | null;
    /**
     * The two sides of "₹531 a class instead of ₹708", both as amounts to
     * pay, GST and all, worked out by the API: one visit's share of the
     * pack, and the least a covered visit costs alone (null for none).
     * Absent from an older API, where the typed prices are compared as
     * before.
     */
    payEach?: string | null;
    singlePay?: string | null;
    /**
     * The GST in or on the price, and the amount to pay; null for none.
     * Absent from an older API. Narrowed where it is read (`gstOnPriceOf`).
     */
    gst?: GstOnPrice | null;
}

/** What a pack's price words read: the pack, and the API's GST on it. */
interface PricedPack {
    price: string;
    currency: string;
    gst?: unknown;
}

/**
 * What a pack costs to pay, beside Buy: "₹4,500", or the API's amount to
 * pay where GST is added ("₹5,310" for ₹4,500 at 18%).
 */
export function packPayPrice(pack: PricedPack): string {
    return payPriceWords(
        accountMoney(pack.price, pack.currency),
        pack.gst,
        pack.currency,
    );
}

/**
 * The price where a pack is only browsed (no Buy beside it): the typed
 * price, with "+ GST" after it when GST comes on top.
 */
export function packBrowsePrice(pack: PricedPack): string {
    return browsePriceWords(
        accountMoney(pack.price, pack.currency),
        gstOnPriceOf(pack.gst)?.mode === "ADDED",
    );
}

function isPublicPack(value: unknown): value is PublicPack {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v.id === "string" &&
        typeof v.name === "string" &&
        (v.description === null || typeof v.description === "string") &&
        typeof v.credits === "number" &&
        typeof v.validityDays === "number" &&
        typeof v.price === "string" &&
        typeof v.currency === "string" &&
        (v.kind === "CLASSES" || v.kind === "ONE_TO_ONE") &&
        (v.singlePrice === null || typeof v.singlePrice === "string")
    );
}

/** The packs in a read's body, narrowed rather than cast (#264); else null. */
export function packsOf(body: unknown): {
    packs: PublicPack[];
    payOnline: boolean;
    notTakingOrders?: true;
} | null {
    const b = body as {
        packs?: unknown;
        payOnline?: unknown;
        notTakingOrders?: unknown;
    } | null;
    if (!Array.isArray(b?.packs)) return null;
    // A website its business's plan paused (#800): nothing sold online.
    const paused = b.notTakingOrders === true;
    return {
        packs: b.packs.filter(isPublicPack),
        payOnline: !paused && b.payOnline === true,
        ...(paused ? { notTakingOrders: true as const } : {}),
    };
}

function count(n: number, one: string, many: string): string {
    return `${n} ${n === 1 ? one : many}`;
}

/** What a pack's credits are for. Unknown (an older API) reads as classes. */
export type PackKind = PublicPack["kind"];

/** "class", or "session" for a one-to-one pack. */
export function packUnit(kind: PackKind | null | undefined): string {
    return kind === "ONE_TO_ONE" ? "session" : "class";
}

/** "10 classes", "1 class"; "5 sessions" for a one-to-one pack. */
export function packCount(
    credits: number,
    kind: PackKind | null | undefined,
): string {
    return kind === "ONE_TO_ONE"
        ? count(credits, "session", "sessions")
        : count(credits, "class", "classes");
}

/** "10 classes · use within 60 days"; sessions for a one-to-one pack. */
export function packEyebrow(pack: PublicPack): string {
    return `${packCount(pack.credits, pack.kind)} · use within ${count(pack.validityDays, "day", "days")}`;
}

/**
 * "₹450 a class instead of ₹600", so a pack can be compared with a single
 * class; without the comparison when there is nothing cheaper to say.
 *
 * Both sides are what is paid, GST and all, and they are the API's
 * (`payEach`, `singlePay`): ₹4,500 for 10 with 18% added is "₹531 a class
 * instead of ₹708". Where GST is in the prices, or none is charged, that
 * is the line it always was. An older API sends neither, and the typed
 * prices are compared as before.
 */
export function packPerClass(pack: PublicPack): string | null {
    if (typeof pack.payEach === "string") {
        const each = Number(pack.payEach);
        if (!Number.isFinite(each)) return null;
        const line = `${accountMoney(pack.payEach, pack.currency)} a ${packUnit(pack.kind)}`;
        const single =
            typeof pack.singlePay === "string" ? Number(pack.singlePay) : NaN;
        return Number.isFinite(single) && single > each
            ? `${line} instead of ${accountMoney(pack.singlePay ?? "", pack.currency)}`
            : line;
    }
    const price = Number(pack.price);
    if (!Number.isFinite(price) || pack.credits <= 0) return null;
    const each = Math.round(price / pack.credits);
    const unit = packUnit(pack.kind);
    const line = `${accountMoney(String(each), pack.currency)} a ${unit}`;
    const single = pack.singlePrice === null ? NaN : Number(pack.singlePrice);
    return Number.isFinite(single) && single > each
        ? `${line} instead of ${accountMoney(pack.singlePrice ?? "", pack.currency)}`
        : line;
}
