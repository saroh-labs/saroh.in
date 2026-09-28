import type { FulfilmentType } from "./dto";

/*
 * What Order Detail's "Change how it's fulfilled…" and "Cancel order…" may
 * offer now (round-2 B9), as the order read's `next` carries it. Types
 * only, so the read can name them without importing what works them out
 * (`order-change-options.ts`).
 */

/** One way the order could leave instead, as the sheet's chips say it. */
export interface FulfilmentOption {
    type: FulfilmentType;
    label: string;
}

export interface ChangeOptions {
    fulfilment: {
        /** The ways it can take now, its own among them, in table order. */
        options: FulfilmentOption[];
        /** Why it can't change now; null when it can. */
        refusal: string | null;
    };
    cancel: {
        /** Why it can't be cancelled; null when it can. */
        refusal: string | null;
        /** A cancel was asked, and waits for the provider on its refund. */
        pending: boolean;
    };
    /**
     * A note in the customer's message thread would reach them ("Tell the
     * customer"): the account area is on and they sign in on the site.
     */
    tell: boolean;
}
