"use client";

import { Button } from "@saroh/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Absent, Row, Section as Rows } from "@/components/sites/settings-rows";
import type { LocationDetails } from "@/lib/stores/location-details";
import { detailsEmpty, detailsSummary } from "@/lib/stores/location-details";
import { LOCATION_SECTIONS } from "@/lib/stores/location-readiness";
import { hoursSummary } from "@/lib/stores/opening-hours-summary";
import type { PlaceSheet } from "@/lib/stores/place-rows";
import {
    addressLine,
    KIND_ANSWER,
    KIND_FOLLOWS,
    PLACE_ROW_ID,
    placeEditId,
} from "@/lib/stores/place-rows";

import { LocationDetailsSheet } from "./location-details-sheet";
import type { SectionProps } from "./location-save";
import {
    PlaceAddressSheet,
    PlaceHoursSheet,
    PlaceKindSheet,
    PlaceNameSheet,
} from "./place-sheets";
import { Section } from "./storefront-section";
import type { PlaceSheets } from "./use-place-sheets";

/**
 * The place, read first (owner, 10 Oct, as Delivery, Payments and People
 * are): one card of rows in Website settings' "label · what is saved ·
 * Edit" pattern. Its name; whether customers come here; only for a place
 * they visit, its address and opening hours; and its description and logo.
 * Each Edit opens that row's own side sheet (`place-sheets.tsx`,
 * `location-details-sheet.tsx`) with one Save; nothing in this tab saves
 * on its own but "Turn Pick-up off". Read-only roles see the rows without
 * Edit. The people who work here are the People tab.
 *
 * Which sheet is open is the page's (`usePlaceSheets`), so the readiness
 * card and Delivery can open one from outside the tab.
 */
export function PlaceSection({
    store,
    canEdit,
    pending,
    save,
    setStore,
    details,
    sheets,
}: SectionProps & {
    /** Left out when they couldn't be read: then there is no row. */
    details?: LocationDetails;
    sheets: PlaceSheets;
}) {
    const router = useRouter();
    // What the description and logo's sheet last saved, until the page has
    // read them again.
    const [savedDetails, setSavedDetails] = useState<LocationDetails | null>(
        null,
    );
    const about = savedDetails ?? details;
    const shop = store.kind === "SHOP";
    const address = addressLine(store.address);

    // Going online only leaves a saved Pick-up as it was; one press here
    // turns it off, rather than leaving the two to contradict each other.
    const ways = store.fulfilmentTypes;
    const pickupLeftOn = canEdit && !shop && Boolean(ways?.includes("PICKUP"));
    const turnPickupOff = () => {
        if (!ways) return;
        const next = ways.filter((t) => t !== "PICKUP");
        setStore((s) => ({ ...s, fulfilmentTypes: next }));
        save({ fulfilmentTypes: next }, "Pick-up turned off", () =>
            setStore((s) => ({ ...s, fulfilmentTypes: ways })),
        );
    };

    /** A row's one action; `name` says what it edits to a screen reader. */
    const edit = (sheet: PlaceSheet, label: string, name?: string) =>
        canEdit ? (
            <Button
                id={placeEditId(sheet)}
                size="sm"
                variant="outline"
                disabled={pending}
                aria-haspopup="dialog"
                aria-label={name}
                onClick={() => sheets.open(sheet)}
            >
                {label}
            </Button>
        ) : null;

    const editing = canEdit ? sheets.editing : null;
    const shared = {
        store,
        pending,
        save,
        open: editing?.open ?? false,
        onClose: sheets.close,
    };

    return (
        <Section
            title={LOCATION_SECTIONS.place.label}
            id={LOCATION_SECTIONS.place.id}
        >
            <Rows>
                <Row
                    id={PLACE_ROW_ID.name}
                    label="Name"
                    action={edit("name", "Edit", "Edit name")}
                >
                    <span
                        data-testid="location-name-summary"
                        className="block [overflow-wrap:anywhere]"
                    >
                        {store.name}
                    </span>
                </Row>
                <Row
                    id={PLACE_ROW_ID.kind}
                    label="Customers come here"
                    action={edit(
                        "kind",
                        "Change",
                        "Change whether customers come here",
                    )}
                >
                    <span data-testid="location-kind-summary" className="block">
                        {KIND_ANSWER[store.kind]}
                    </span>
                    <span className="block text-pretty text-[12.5px] text-muted-foreground">
                        {KIND_FOLLOWS[store.kind]}
                    </span>
                    {pickupLeftOn ? (
                        // No counter, but Pick-up still on (just switched,
                        // or saved that way before): the way out, right
                        // here.
                        <div
                            role="status"
                            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-muted px-3 py-2.5 text-[12.5px] leading-[1.5]"
                        >
                            <span className="min-w-0 flex-[1_1_220px]">
                                Pick-up is still on, but with no counter nobody
                                can collect from here.
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={pending}
                                onClick={turnPickupOff}
                            >
                                Turn Pick-up off
                            </Button>
                        </div>
                    ) : null}
                </Row>
                {/* Only a place customers visit has a door: where it is
                    and when it is open. */}
                {shop ? (
                    <Row
                        id={PLACE_ROW_ID.address}
                        label="Address"
                        action={
                            address
                                ? edit("address", "Edit", "Edit address")
                                : edit("address", "Add address")
                        }
                    >
                        <span
                            data-testid="location-address-summary"
                            className="block [overflow-wrap:anywhere]"
                        >
                            {address ?? <Absent>No address yet</Absent>}
                        </span>
                    </Row>
                ) : null}
                {shop ? (
                    <Row
                        id={PLACE_ROW_ID.hours}
                        label="Opening hours"
                        action={
                            store.openingHours
                                ? edit("hours", "Edit", "Edit opening hours")
                                : edit("hours", "Set hours")
                        }
                    >
                        <span
                            data-testid="location-hours-summary"
                            className="block tabular-nums"
                        >
                            {store.openingHours ? (
                                hoursSummary(store.openingHours)
                            ) : (
                                <Absent>{hoursSummary(null)}</Absent>
                            )}
                        </span>
                    </Row>
                ) : null}
                {about ? (
                    <Row
                        id={PLACE_ROW_ID.details}
                        label="Description and logo"
                        action={edit(
                            "details",
                            "Edit",
                            "Edit description and logo",
                        )}
                    >
                        <span data-testid="location-details-summary">
                            {detailsEmpty(about) ? (
                                <Absent>{detailsSummary(about)}</Absent>
                            ) : (
                                detailsSummary(about)
                            )}
                        </span>
                    </Row>
                ) : null}
            </Rows>

            {/* The open sheet, a fresh draft each time it opens. */}
            {editing?.which === "name" ? (
                <PlaceNameSheet key={editing.opened} {...shared} />
            ) : null}
            {editing?.which === "kind" ? (
                <PlaceKindSheet
                    key={editing.opened}
                    {...shared}
                    setStore={setStore}
                    onVisited={() => {
                        // Becoming a place customers visit asks for its
                        // address next.
                        if (!address) sheets.next("address");
                    }}
                />
            ) : null}
            {editing?.which === "address" ? (
                <PlaceAddressSheet
                    key={editing.opened}
                    {...shared}
                    open={shared.open && shop}
                />
            ) : null}
            {editing?.which === "hours" ? (
                <PlaceHoursSheet
                    key={editing.opened}
                    {...shared}
                    open={shared.open && shop}
                />
            ) : null}
            {editing?.which === "details" && about ? (
                <LocationDetailsSheet
                    key={editing.opened}
                    storeId={store.id}
                    name={store.name}
                    details={about}
                    open={shared.open}
                    onClose={sheets.close}
                    onSaved={(next) => {
                        setSavedDetails(next);
                        router.refresh();
                    }}
                />
            ) : null}
        </Section>
    );
}
