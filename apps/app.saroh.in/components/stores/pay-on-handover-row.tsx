"use client";

import type {
    StorefrontInput,
    StorefrontSettings,
} from "@/lib/stores/storefronts";

import { Note, ToggleRow } from "./storefront-section";

type Saver = (
    input: StorefrontInput,
    said: string,
    onFail?: () => void,
) => void;

/**
 * "Pay when you collect" and "Pay on delivery" at the website's checkout
 * (2026-10-06: online needs a paid plan, Free takes money offline), under
 * Checkout's Payments.
 *
 * On a plan that takes payment online it is a switch, off by default:
 * on, the checkout offers it beside paying online. On a plan without
 * online payments there is nothing to choose — it is the only way the
 * website takes orders — so the row says so instead of showing a switch
 * that would do nothing. Either way an order paid like this lands unpaid,
 * holds its items, and is marked paid here when the money is taken.
 *
 * An API from before it sends no value, and the row isn't drawn.
 */
export function PayOnHandoverRow({
    store,
    canEdit,
    pending,
    save,
    setStore,
}: {
    store: StorefrontSettings;
    canEdit: boolean;
    pending: boolean;
    save: Saver;
    setStore: (fn: (s: StorefrontSettings) => StorefrontSettings) => void;
}) {
    if (store.offerPayOnHandover === undefined) return null;

    if (store.onlinePaymentsPlan === false) {
        return (
            <div className="grid gap-1">
                <p className="text-[13.5px] font-medium">
                    Pay when they collect, or on delivery
                </p>
                <Note>
                    Your plan takes payment in person, so website orders are
                    paid when collected or delivered, and Shipping isn&rsquo;t
                    offered. Mark each one paid when you take the money.
                </Note>
            </div>
        );
    }

    const flip = (value: boolean) => {
        setStore((s) => ({ ...s, offerPayOnHandover: value }));
        save(
            { offerPayOnHandover: value },
            value
                ? "Customers can now pay when they collect or on delivery"
                : "Customers now pay online at checkout",
            () => setStore((s) => ({ ...s, offerPayOnHandover: !value })),
        );
    };

    return (
        <ToggleRow
            id="storefront-pay-on-handover"
            label="Let customers pay when they collect or on delivery"
            note="Offered beside paying online, for pick-up and local delivery. Mark the order paid when you take the money."
            checked={store.offerPayOnHandover}
            disabled={!canEdit || pending}
            onChange={flip}
        />
    );
}
