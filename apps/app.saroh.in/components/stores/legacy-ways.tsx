"use client";

import type { SectionProps } from "./location-save";
import { ToggleRow } from "./storefront-section";

/**
 * Delivery for an API from before B17's chips: the two switches it had,
 * collection and delivery, with no fees or late times to set.
 */
export function LegacyWays({
    store,
    canEdit,
    pending,
    save,
    setStore,
}: SectionProps) {
    const flip =
        (
            key: "collectionEnabled" | "shippingEnabled",
            on: string,
            off: string,
        ) =>
        (value: boolean) => {
            setStore((s) => ({ ...s, [key]: value }));
            save({ [key]: value }, value ? on : off, () => {
                setStore((s) => ({ ...s, [key]: !value }));
            });
        };
    return (
        <>
            {store.kind === "SHOP" ? (
                <ToggleRow
                    id="storefront-collection"
                    label="Pick-up"
                    note="Customers pick up in person."
                    checked={store.collectionEnabled}
                    disabled={!canEdit || pending}
                    onChange={flip(
                        "collectionEnabled",
                        "Pick-up turned on",
                        "Pick-up turned off",
                    )}
                />
            ) : null}
            <ToggleRow
                id="storefront-delivery"
                label="Delivery"
                note="Orders from here can be sent to the customer."
                checked={store.shippingEnabled}
                disabled={!canEdit || pending}
                onChange={flip(
                    "shippingEnabled",
                    "Delivery turned on",
                    "Delivery turned off",
                )}
            />
        </>
    );
}
