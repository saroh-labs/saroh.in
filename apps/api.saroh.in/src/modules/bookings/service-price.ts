import { rateToBps } from "../invoices/gst";
import type {
    GstOnPrice,
    GstPriceMode,
    PriceTerms,
} from "../invoices/gst-price";
import {
    effectivePriceMode,
    gstInsidePaid,
    gstOnPrice,
    isGstPriceMode,
    priceCharge,
} from "../invoices/gst-price";

/*
 * What a service costs to book (12 Oct 2026): its typed price turned into
 * the amount to pay by the one sum (`invoices/gst-price.ts`), under the
 * service's own choice or the business's.
 *
 * A booking freezes that amount in its snapshot (`service.priceCents`),
 * with the typed price and the mode beside it, so everything after —
 * the deposit, what is due at the visit, the desk, a pay link, the paper —
 * works from what was agreed and a later change of the business's choice
 * never reaches a booking already made.
 */

/** The columns of a service its price is worked out from. */
export interface PricedService {
    priceCents: number | null;
    gstRate: { toString(): string } | null;
    gstPriceMode?: string | null;
}

export interface ServiceCharge {
    /** The price the business typed; null when it has none. */
    listCents: number | null;
    /** The amount to pay for one booking; null when it has no price. */
    payCents: number | null;
    /**
     * What it is charged under, or null when no GST is charged on it (not
     * registered, no rate, exempt) or it has no price.
     */
    mode: GstPriceMode | null;
    /** The customer's GST words, or null when nothing is said. */
    gst: GstOnPrice | null;
}

const NO_CHARGE: ServiceCharge = {
    listCents: null,
    payCents: null,
    mode: null,
    gst: null,
};

/** A service's price as it is charged today. */
export function serviceCharge(
    service: PricedService,
    terms: PriceTerms,
): ServiceCharge {
    if (service.priceCents === null || service.priceCents <= 0) {
        return { ...NO_CHARGE, listCents: service.priceCents };
    }
    const input = {
        listCents: service.priceCents,
        rateBps: rateToBps(service.gstRate),
        mode: effectivePriceMode(terms.mode, service.gstPriceMode),
        registered: terms.registered,
    };
    const charge = priceCharge(input);
    return {
        listCents: service.priceCents,
        payCents: charge.payCents,
        mode: charge.mode,
        gst: gstOnPrice(input),
    };
}

/** What a booking's snapshot keeps of the price it was made at. */
export interface BookedPrice {
    /** The amount to pay for the booking. */
    priceCents: number | null;
    /** The typed price, and what it was charged under; null before both. */
    listPriceCents: number | null;
    gstPriceMode: GstPriceMode | null;
}

/** The snapshot's price fields for a booking made now. */
export function bookedPriceOf(charge: ServiceCharge): BookedPrice {
    return {
        priceCents: charge.payCents ?? charge.listCents,
        listPriceCents: charge.listCents,
        gstPriceMode: charge.mode,
    };
}

/**
 * What a hold asks for online, from the booking it holds: its deposit when
 * only the deposit is paid, else its whole price. Null when the snapshot
 * names neither (never for a booking made by `reserveInTx`).
 */
export function heldAmountCents(
    snapshot: unknown,
    pay: string | undefined,
): number | null {
    const s = snapshot as {
        service?: { priceCents?: unknown };
        deposit?: { cents?: unknown };
    } | null;
    if (pay === "DEPOSIT" && typeof s?.deposit?.cents === "number") {
        return s.deposit.cents;
    }
    return typeof s?.service?.priceCents === "number"
        ? s.service.priceCents
        : null;
}

/**
 * What a booking was charged under, from its snapshot: null on a booking
 * from before the choice existed (its price included GST) and on one with
 * no GST in it.
 */
export function bookedPriceMode(snapshot: unknown): GstPriceMode | null {
    const mode = (snapshot as { service?: { gstPriceMode?: unknown } } | null)
        ?.service?.gstPriceMode;
    return isGstPriceMode(mode) ? mode : null;
}

/**
 * The customer's GST words for an amount of a booking — its price, its
 * deposit, what is left — at the service's rate and the mode the booking
 * was made under. `registered` is whether the paper for it is a tax
 * invoice.
 */
export function bookingGstWords(input: {
    cents: number;
    snapshot: unknown;
    gstRate: { toString(): string } | null;
    registered: boolean;
}): GstOnPrice | null {
    return gstInsidePaid({
        payCents: input.cents,
        rateBps: rateToBps(input.gstRate),
        mode: bookedPriceMode(input.snapshot),
        registered: input.registered,
    });
}
