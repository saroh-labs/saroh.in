"use client";

import type {
    StorefrontInput,
    StorefrontSettings,
} from "@/lib/stores/storefronts";

import { Note, Section, ToggleRow } from "./storefront-section";

type Saver = (
    input: StorefrontInput,
    said: string,
    onFail?: () => void,
) => void;

/**
 * Customers who share an email (DEC-055, C15): whether a customer who pays
 * at this storefront with an email a customer of another storefront already
 * has is linked to that customer on their own, or left for staff (the
 * default). One switch in the design's TOGGLES shape, saved when flipped.
 *
 * The copy says plainly what linking does and where it stops: never to
 * someone added by hand or an enquiry, never past an unconfirmed email on
 * the website, and never for customers who already share one.
 *
 * Changing it needs `contact:write` as well as `store:write` (the API
 * checks); without it the switch shows, disabled. An API from before C15
 * sends no value, and the section isn't drawn.
 */
export function SameEmailSection({
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
    if (store.linkSameEmailCustomers === undefined) return null;
    const on = store.linkSameEmailCustomers;

    const flip = (value: boolean) => {
        setStore((s) => ({ ...s, linkSameEmailCustomers: value }));
        save(
            { linkSameEmailCustomers: value },
            value
                ? "Customers who share an email will be linked"
                : "Customers who share an email are left for you to link",
            () => setStore((s) => ({ ...s, linkSameEmailCustomers: !value })),
        );
    };

    return (
        <Section title="Customers">
            <ToggleRow
                id="storefront-same-email"
                label="Link customers who share an email"
                note="When someone pays here with the same email as a customer of another of your locations, their orders go on that customer's record. Off means you link them yourself from Customers."
                checked={on}
                disabled={!canEdit || pending}
                onChange={flip}
            />
            <Note>
                Only customers who first bought from one of your locations are
                linked, never someone you added by hand or an enquiry. If that
                customer signs in on your website and hasn&rsquo;t confirmed
                their email, you&rsquo;re asked instead. Customers who already
                share an email stay as they are.
            </Note>
        </Section>
    );
}
