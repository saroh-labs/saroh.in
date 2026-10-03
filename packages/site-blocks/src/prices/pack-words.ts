import { accountMoney } from "../account/model";

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
export function packsOf(
    body: unknown,
): { packs: PublicPack[]; payOnline: boolean } | null {
    const b = body as { packs?: unknown; payOnline?: unknown } | null;
    if (!Array.isArray(b?.packs)) return null;
    return {
        packs: b.packs.filter(isPublicPack),
        payOnline: b.payOnline === true,
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
 */
export function packPerClass(pack: PublicPack): string | null {
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
