import { DISPLAY_LOCALE } from "@/lib/format/locale";
import { METHOD_WORD } from "@/lib/payments/method-words";

import type { PackStanding } from "./balance";
import type { PackKind } from "./pack-cards";
import { money, packKind, unitWord } from "./pack-cards";

/**
 * The sell dialog's words and rules (round-2 E15, after "Saroh Packs"):
 * what the desk took, the pack's terms, who may not have a first-pack-only
 * pack, and the API's refusals in the merchant's words. Pure.
 */

/**
 * How the desk was paid. A record of what was taken, never a limit on how
 * anyone pays (DEC-059): the business's payment account decides that.
 * ONLINE is the site's and a pay link's, never chosen at the desk.
 */
export type DeskPaidBy = "CASH" | "UPI" | "CARD" | "BANK" | "NONE";
export type PaidBy = DeskPaidBy | "ONLINE";

export const DESK_PAID_BY: readonly { value: DeskPaidBy; label: string }[] = [
    { value: "CASH", label: METHOD_WORD.CASH },
    { value: "UPI", label: METHOD_WORD.UPI },
    { value: "CARD", label: METHOD_WORD.CARD },
    { value: "BANK", label: METHOD_WORD.BANK },
    { value: "NONE", label: "No payment" },
];

const PAID_BY_LABEL: Record<PaidBy, string> = {
    CASH: METHOD_WORD.CASH,
    UPI: METHOD_WORD.UPI,
    CARD: METHOD_WORD.CARD,
    BANK: METHOD_WORD.BANK,
    ONLINE: "Online",
    NONE: "None",
};

/** How a sale was paid, in a list: "UPI"; "—" when nobody recorded it. */
export function paidByLabel(paidBy: PaidBy | null | undefined): string {
    return paidBy ? PAID_BY_LABEL[paidBy] : "—";
}

/** The pack as the dialog reads it. */
export interface SellPack {
    id: string;
    name: string;
    credits: number;
    validityDays: number;
    price: string;
    currency: string;
    kind?: PackKind;
    firstPackOnly?: boolean;
}

const DAY_MS = 86_400_000;

/** "12 January 2027": the day a pack sold at `now` runs out. */
export function lastDayFor(validityDays: number, now: number): string {
    return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(new Date(now + validityDays * DAY_MS));
}

/** Under the title: "₹1,500 · 10 classes · use by 12 January 2027". */
export function sellTerms(pack: SellPack, now: number): string {
    const kind = packKind(pack);
    return [
        money(pack.price, pack.currency),
        `${pack.credits} ${unitWord(kind, pack.credits)}`,
        `use by ${lastDayFor(pack.validityDays, now)}`,
    ].join(" · ");
}

/** A purchase as the dialog reads it, to know who has had a pack. */
export interface HeldPack {
    contactId: string;
    packId: string;
    left: number;
    standing: PackStanding;
}

/** The kind of each pack sold, by id; a pack not listed is not known. */
export type KindOf = (packId: string) => PackKind | undefined;

/**
 * Has this person had a pack of this kind? The API's first-pack rule
 * (E13): anyone who holds or held one, live or not. Only purchases of a
 * known kind count, so an unknown pack never blocks a sale — the API
 * still decides.
 */
export function hadPackOfKind(
    held: readonly HeldPack[],
    contactId: string,
    kind: PackKind,
    kindOf: KindOf,
): boolean {
    return held.some(
        (h) => h.contactId === contactId && kindOf(h.packId) === kind,
    );
}

/** Why a first-pack-only pack can't go to them. */
export function firstPackRefusal(packName: string, who: string): string {
    return `${packName} is only for a first pack, and ${who} has had one before.`;
}

/** Null when the sale may go ahead; else why not, in words. */
export function firstPackBlock(
    pack: SellPack,
    contactId: string,
    who: string,
    held: readonly HeldPack[],
    kindOf: KindOf,
): string | null {
    if (!pack.firstPackOnly || !contactId) return null;
    return hadPackOfKind(held, contactId, packKind(pack), kindOf)
        ? firstPackRefusal(pack.name, who)
        : null;
}

/**
 * "Has 4 classes left on other packs." — what they hold now of this kind,
 * or null when nothing.
 */
export function holdingNow(
    held: readonly HeldPack[],
    contactId: string,
    kind: PackKind,
    kindOf: KindOf,
): string | null {
    if (!contactId) return null;
    const left = held
        .filter(
            (h) =>
                h.contactId === contactId &&
                h.standing === "ACTIVE" &&
                kindOf(h.packId) === kind,
        )
        .reduce((n, h) => n + h.left, 0);
    if (left === 0) return null;
    return `Has ${left} ${unitWord(kind, left)} left on other packs.`;
}

/** The API's 409 for a first-pack-only pack (`class-packs/first-pack.ts`). */
export const FIRST_PACK_ONLY = "Only for a first pack";

/** A refused sale, in the merchant's words. */
export function sellFailure(error: string, packName: string, who: string) {
    return error === FIRST_PACK_ONLY ? firstPackRefusal(packName, who) : error;
}

/**
 * The line above the buttons. With Payments on, the plan's "Books nothing ·
 * invoice ₹X"; with it off, no invoice is mentioned, because none is made.
 */
export function sellNote(pack: SellPack, invoicesOnSale: boolean): string {
    const kind = packKind(pack);
    const theirs = `The ${unitWord(kind, 2)} are on their account straight away.`;
    return invoicesOnSale
        ? `Books nothing · invoice ${money(pack.price, pack.currency)}. ${theirs} Saroh doesn't send the invoice — open it from Invoices to print it or mark it paid.`
        : `Books nothing. ${theirs}`;
}

/** "Take ₹1,500" when the desk took money; else "Sell" (and invoice). */
export function sellLabel(
    pack: SellPack | undefined,
    paidBy: DeskPaidBy | "",
    invoicesOnSale: boolean,
): string {
    if (pack && paidBy && paidBy !== "NONE") {
        return `Take ${money(pack.price, pack.currency)}`;
    }
    return invoicesOnSale ? "Sell and invoice" : "Sell";
}

/** The toast once sold: "Asha has 10 more classes, to use by 12 January 2027." */
export function soldMessage(
    who: string,
    pack: SellPack,
    now: number,
    invoiced: boolean,
): string {
    const first = who.trim().split(/\s+/)[0] || who;
    const kind = packKind(pack);
    const base = `${first} has ${pack.credits} more ${unitWord(kind, pack.credits)}, to use by ${lastDayFor(pack.validityDays, now)}.`;
    return invoiced ? `${base} The invoice is issued.` : base;
}
