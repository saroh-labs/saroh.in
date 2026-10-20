"use client";

import type { DeliveryAddress, ShopPayment, ShopWay } from "./api";
import type { BagDraft } from "./bag-sheet";
import { EMPTY_DRAFT } from "./bag-sheet";
import { cleanCode } from "./code-field";
import { stateIn } from "./india-states";

/**
 * What the customer chose in the bag, kept for the visit (`sessionStorage`,
 * per site): how the order leaves, how it's paid, the address typed (or
 * their last delivery's, and whether they chose another), the discount
 * code and the checkout's key. Signing in is the bag's last step,
 * and the email code is read in another app. Phones, and the browsers
 * inside WhatsApp and Instagram above all, often load the page again on the
 * way back, and the address would be typed twice. The key comes back too,
 * so the same bag placed after a reload is still the same order.
 *
 * `sessionStorage`, not a cookie and not `localStorage`: it never leaves
 * the browser, and it ends with the tab. Only what the customer typed in
 * the bag is kept, and never the note for the business, which may say
 * something about someone's health. It is emptied when the order is placed. Every read and
 * write is wrapped, as the bag's are: a storage that refuses leaves this
 * page's memory only.
 */

const keyOf = (site: string) => `saroh.bag-draft.${site}`;

const WAYS: readonly ShopWay[] = ["PICKUP", "LOCAL_DELIVERY", "SHIPPING"];
const PAYS: readonly ShopPayment[] = ["ONLINE", "ON_HANDOVER"];
const SAVED = ["shown", "typing"] as const;
const ADDRESS_FIELDS = [
    "name",
    "phone",
    "line1",
    "line2",
    "city",
    "state",
    "postalCode",
] as const satisfies readonly (keyof DeliveryAddress)[];
/** Longer than any field the checkout takes. */
const FIELD_MAX = 200;
/** A checkout's key: letters, digits, `_` and `-` (`checkoutKey`). */
const KEY = /^[A-Za-z0-9_-]{1,128}$/;
/** A bag's print is its lines and address; a full bag is far under this. */
const PRINT_MAX = 20_000;

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

/** What is stored, narrowed field by field: anything else reads as unset. */
export function parseBagDraft(raw: string | null): BagDraft {
    if (!raw) return EMPTY_DRAFT;
    let stored: unknown;
    try {
        stored = JSON.parse(raw);
    } catch {
        return EMPTY_DRAFT;
    }
    if (!isRecord(stored)) return EMPTY_DRAFT;

    const typed = isRecord(stored.address) ? stored.address : {};
    const address: DeliveryAddress = { ...EMPTY_DRAFT.address };
    for (const name of ADDRESS_FIELDS) {
        const value = typed[name];
        if (typeof value === "string") {
            address[name] = value.slice(0, FIELD_MAX);
        }
    }
    // State is a choice now: one typed before reads as the list names it.
    address.state = stateIn(address.state);

    const checkout = isRecord(stored.checkout) ? stored.checkout : null;
    return {
        way: WAYS.find((w) => w === stored.way) ?? null,
        pay: PAYS.find((p) => p === stored.pay) ?? null,
        address,
        saved: SAVED.find((v) => v === stored.saved) ?? null,
        // Never kept: see `writeBagDraft`.
        note: "",
        code: typeof stored.code === "string" ? cleanCode(stored.code) : null,
        checkout:
            checkout &&
            typeof checkout.print === "string" &&
            checkout.print.length <= PRINT_MAX &&
            typeof checkout.key === "string" &&
            KEY.test(checkout.key)
                ? { print: checkout.print, key: checkout.key }
                : null,
    };
}

/** Nothing chosen or typed: there is nothing to keep. */
function isEmpty(draft: BagDraft): boolean {
    return (
        draft.way === null &&
        draft.pay === null &&
        draft.code === null &&
        draft.checkout === null &&
        ADDRESS_FIELDS.every((name) => !draft.address[name])
    );
}

export function readBagDraft(site: string): BagDraft {
    try {
        return parseBagDraft(window.sessionStorage.getItem(keyOf(site)));
    } catch {
        return EMPTY_DRAFT;
    }
}

/** Keep the draft for the visit; an empty one clears what was kept. */
export function writeBagDraft(site: string, draft: BagDraft): void {
    writeStored(site, draft);
    // A look's checkout page and the header's bag both hold the draft: each
    // hears the other's change (`onBagDraft`).
    draftListeners.forEach((heard) => heard(site));
}

const draftListeners = new Set<(site: string) => void>();

/** Hear the visit's draft change for a site; returns how to stop. */
export function onBagDraft(heard: (site: string) => void): () => void {
    draftListeners.add(heard);
    return () => {
        draftListeners.delete(heard);
    };
}

function writeStored(site: string, draft: BagDraft): void {
    try {
        // The note stays in the page's memory: "no nuts", "after my
        // surgery" may say something about someone's health, and nothing
        // like that is written anywhere but the order.
        const { note: _note, ...kept } = draft;
        if (isEmpty(draft)) window.sessionStorage.removeItem(keyOf(site));
        else {
            window.sessionStorage.setItem(keyOf(site), JSON.stringify(kept));
        }
    } catch {
        // Kept in the bag's state for this page only.
    }
}
