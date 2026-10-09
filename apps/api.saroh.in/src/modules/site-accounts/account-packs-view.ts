import { toMoneyString } from "../../common/money";
import type { PackTerms } from "../class-packs/pack-checkout";
import type { CreateIntentResult } from "../payments/payments.service";

/**
 * What a signed-in customer is told about buying a class pack online
 * (round-2 A11; ADR-011), and nothing more: the allow-list for
 * `public/site-accounts/me/packs`, re-exported by `customer-view.ts` as
 * `account-bookings-view.ts` is. A pack's ref is its id, the one thing the
 * site sends back to buy it; an attempt's ref is its draft invoice's id,
 * used only to ask how it stands. No other ids, no staff wording, no
 * holder counts.
 */

/** A pack on sale, as the Buy a pack sheet lists it. */
export interface AccountPackOnSale {
    ref: string;
    name: string;
    description: string | null;
    credits: number;
    validityDays: number;
    price: string;
    currency: string;
    /** Classes, or one-to-one sessions: how the sheet counts the credits. */
    kind: "CLASSES" | "ONE_TO_ONE";
}

/** The packs a customer can buy here, and whether they can pay online. */
export interface AccountPacksOnSale {
    /**
     * False: the business takes no payment online (Payments off, or no
     * provider whose window can open), so the sheet says to buy at the desk
     * and offers no pay button.
     */
    payOnline: boolean;
    packs: AccountPackOnSale[];
    /**
     * True on a website a move to a lower plan paused (#800): nothing is
     * sold here online, and the sheet says the business isn't taking
     * orders. Absent otherwise.
     */
    notTakingOrders?: true;
}

/** A started purchase: what is being paid, and the provider's handoff. */
export interface AccountPackCheckout {
    ref: string;
    pack: { name: string; credits: number; validityDays: number };
    total: string;
    currency: string;
    /** The provider's non-secret handoff; the amount is the draft's. */
    payment: CreateIntentResult;
}

/**
 * How a started purchase stands, for the sheet waiting on the payment:
 * paying (no answer yet), bought (the pack is on the account) or closed
 * (never paid, and discarded or replaced).
 */
export interface AccountPackAttempt {
    state: "paying" | "bought" | "closed";
    pack: { name: string; credits: number };
    /** Once bought: when its credits run out. */
    expiresAt: string | null;
}

export function packOnSaleView(pack: {
    id: string;
    name: string;
    description: string | null;
    credits: number;
    validityDays: number;
    price: { toString(): string };
    currency: string;
    kind: string;
}): AccountPackOnSale {
    const description = pack.description?.trim() ?? "";
    return {
        ref: pack.id,
        name: pack.name,
        description: description.length > 0 ? description : null,
        credits: pack.credits,
        validityDays: pack.validityDays,
        price: toMoneyString(pack.price.toString()),
        currency: pack.currency,
        kind: pack.kind === "ONE_TO_ONE" ? "ONE_TO_ONE" : "CLASSES",
    };
}

export function packCheckoutView(input: {
    invoiceId: string;
    terms: PackTerms;
    total: { toString(): string };
    currency: string;
    payment: CreateIntentResult;
}): AccountPackCheckout {
    return {
        ref: input.invoiceId,
        pack: {
            name: input.terms.name,
            credits: input.terms.credits,
            validityDays: input.terms.validityDays,
        },
        total: toMoneyString(input.total.toString()),
        currency: input.currency,
        payment: input.payment,
    };
}

export function packAttemptView(input: {
    status: string;
    terms: PackTerms;
    expiresAt: Date | null;
}): AccountPackAttempt {
    const state =
        input.status === "DRAFT"
            ? "paying"
            : input.status === "PAID"
              ? "bought"
              : "closed";
    return {
        state,
        pack: { name: input.terms.name, credits: input.terms.credits },
        expiresAt:
            state === "bought" && input.expiresAt
                ? input.expiresAt.toISOString()
                : null,
    };
}
