"use client";

import { Button } from "@saroh/ui/button";
import { Fragment, useState } from "react";

import { Row, Section as Rows } from "@/components/sites/settings-rows";
import { waySummary } from "@/lib/stores/delivery-summary";
import { STOREFRONT_FULFILMENT_TYPES } from "@/lib/stores/fulfilment-types";
import { FULFILMENT_LABEL } from "@/lib/stores/late-after";
import {
    ADDRESS_FIELD_ID,
    KIND_FIELD_ID,
    LOCATION_SECTIONS,
} from "@/lib/stores/location-readiness";
import type { StorefrontFulfilmentType } from "@/lib/stores/storefronts";

import { DeliveryWayPanel } from "./delivery-way-panel";
import { LegacyWays } from "./legacy-ways";
import type { SectionProps } from "./location-save";
import { jumpTo } from "./location-save";
import { Note, Section } from "./storefront-section";

/** Where Orders' notice sends someone to change a threshold. */
export const LATE_AFTER_ANCHOR = "late-after";

type Way = StorefrontFulfilmentType;

const LINK =
    "rounded-sm font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-muted-foreground";

/**
 * Delivery, read first and edited one way at a time (the 9 Oct second
 * pass, after the owner turned down a grid of open fields): each way is a
 * row in Website settings' "label · value · Edit" pattern, its value a
 * sentence ("₹40 · free over ₹999 · late after 24 h", "Off"). Edit opens
 * that way's panel under its row, with one Save for its on/off, its fee,
 * the location's free-over amount and its late time; nothing in this tab
 * saves on its own. Read-only roles see the rows without Edit.
 *
 * Pick-up needs a door (UX-025): where customers can't visit it reads "Not
 * offered" with the way to a counter ("Add an address" opens The place).
 * One already on there (saved before) says so and offers turning it off;
 * nothing changes on render.
 *
 * Digital products and bookings have no row: Digital is never late, and a
 * booking follows its visits.
 */
export function FulfilmentSection(props: SectionProps) {
    const { store, canEdit, pending, save, setStore, goTo } = props;
    const [editing, setEditing] = useState<Way | null>(null);

    const go = (focus: string) => {
        if (goTo) goTo("the-place", focus);
        else jumpTo(focus);
    };

    if (!store.fulfilmentTypes) {
        return (
            <Section
                title={LOCATION_SECTIONS.delivery.label}
                id={LOCATION_SECTIONS.delivery.id}
            >
                <LegacyWays {...props} />
            </Section>
        );
    }
    const types = store.fulfilmentTypes;

    const turnPickupOff = () => {
        const next = types.filter((t) => t !== "PICKUP");
        setStore((s) => ({ ...s, fulfilmentTypes: next }));
        save({ fulfilmentTypes: next }, "Pick-up turned off", () =>
            setStore((s) => ({ ...s, fulfilmentTypes: types })),
        );
    };

    return (
        <Section
            title={LOCATION_SECTIONS.delivery.label}
            id={LOCATION_SECTIONS.delivery.id}
        >
            <div id={LATE_AFTER_ANCHOR} className="grid scroll-mt-20 gap-3">
                {store.siteShop ? (
                    <Note>Your website checkout offers these.</Note>
                ) : null}
                <Rows>
                    {STOREFRONT_FULFILMENT_TYPES.map((type) => {
                        const label = FULFILMENT_LABEL[type];
                        const said = waySummary(store, type);
                        const open = editing === type;
                        const id = `delivery-${type.toLowerCase()}`;
                        const action =
                            !canEdit ? null : said.notOffered ? null : said.stranded ? (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={pending}
                                    onClick={turnPickupOff}
                                >
                                    Turn off
                                </Button>
                            ) : open ? null : (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={pending || editing !== null}
                                    aria-expanded={false}
                                    aria-controls={`${id}-panel`}
                                    aria-label={`Edit ${label.toLowerCase()}`}
                                    onClick={() => setEditing(type)}
                                >
                                    Edit
                                </Button>
                            );
                        return (
                            <Fragment key={type}>
                                <Row id={id} label={label} action={action}>
                                    <span
                                        data-testid={`${id}-summary`}
                                        className="block [overflow-wrap:anywhere]"
                                    >
                                        {said.text}
                                    </span>
                                    {said.note ? (
                                        <span className="block text-[12.5px] text-muted-foreground">
                                            {said.note}
                                            {canEdit && said.fix ? (
                                                <>
                                                    {" "}
                                                    <button
                                                        type="button"
                                                        className={LINK}
                                                        onClick={() =>
                                                            // No counter: "Yes,
                                                            // they visit" asks
                                                            // for the address.
                                                            go(
                                                                said.fix ===
                                                                    "address"
                                                                    ? ADDRESS_FIELD_ID
                                                                    : KIND_FIELD_ID,
                                                            )
                                                        }
                                                    >
                                                        Add an address
                                                    </button>
                                                </>
                                            ) : null}
                                        </span>
                                    ) : null}
                                </Row>
                                {open ? (
                                    <DeliveryWayPanel
                                        // A fresh draft each time it opens.
                                        key={`${type}-panel`}
                                        store={store}
                                        type={type}
                                        pending={pending}
                                        save={save}
                                        onClose={() => {
                                            setEditing(null);
                                            // Back to the row's Edit.
                                            requestAnimationFrame(() =>
                                                document
                                                    .querySelector<HTMLElement>(
                                                        `#${id} button`,
                                                    )
                                                    ?.focus(),
                                            );
                                        }}
                                    />
                                ) : null}
                            </Fragment>
                        );
                    })}
                </Rows>
                <Note>Bookings and digital products need none of these.</Note>
            </div>
        </Section>
    );
}
