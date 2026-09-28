import type { PaymentHandoff } from "../booking-flow/api";

/**
 * Buying a class pack from the account (round-2 plan A, A11): what the
 * Plan tab is told about the packs on sale, and what it asks of the site's
 * server — its server actions, handed in, since the page never calls the
 * API itself. Each refusal comes back in the customer's words.
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
}

/** The packs a customer can buy here, and whether they can pay online. */
export interface AccountPacksOnSale {
    /** False: the business takes no payment online; buy at the desk. */
    payOnline: boolean;
    packs: AccountPackOnSale[];
}

/** A started purchase: what is being paid, and the provider's handoff. */
export interface AccountPackCheckout {
    ref: string;
    pack: { name: string; credits: number; validityDays: number };
    total: string;
    currency: string;
    payment: PaymentHandoff;
}

/** How a started purchase stands. */
export interface AccountPackAttempt {
    state: "paying" | "bought" | "closed";
    pack: { name: string; credits: number };
    expiresAt: string | null;
}

export type PackResult<T> =
    { ok: true; data: T } | { ok: false; message: string };

export interface PacksApi {
    /** Start paying for a pack; the same key replays the same payment. */
    buy: (
        ref: string,
        idempotencyKey: string,
    ) => Promise<PackResult<AccountPackCheckout>>;
    /** How a started payment stands. */
    standing: (ref: string) => Promise<PackResult<AccountPackAttempt>>;
}

/** What the Plan tab needs to sell packs: what is on sale, and the actions. */
export interface PlanPacksShop {
    onSale: AccountPacksOnSale;
    api: PacksApi;
}

/** Said when the site's server couldn't be reached. */
export const PACKS_OFFLINE =
    "We couldn't reach the business. Try again in a moment.";

/** "10 classes", "1 class". */
export function classesText(credits: number): string {
    return `${credits} ${credits === 1 ? "class" : "classes"}`;
}

/** The sheet's lead, as the design words it: "10 credits to use within 60 days." */
export function packTermsLine(pack: {
    credits: number;
    validityDays: number;
}): string {
    return `${pack.credits} ${pack.credits === 1 ? "credit" : "credits"} to use within ${pack.validityDays} ${pack.validityDays === 1 ? "day" : "days"}.`;
}

/** Said once a pack is bought, as the design flashes it. */
export function boughtMessage(name: string): string {
    return `${name} bought. Book a class to use one.`;
}
