"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@saroh/ui/toggle-group";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";
import { Absent, Row, Section as Rows } from "@/components/sites/settings-rows";
import { storefrontDetailsHref } from "@/lib/stores/links";
import type { LocationDetails } from "@/lib/stores/location-details";
import { detailsEmpty, detailsSummary } from "@/lib/stores/location-details";
import {
    ADDRESS_FIELD_ID,
    KIND_FIELD_ID,
    LOCATION_SECTIONS,
} from "@/lib/stores/location-readiness";
import type { StorefrontKind } from "@/lib/stores/storefronts";

import type { SectionProps } from "./location-save";
import { jumpTo } from "./location-save";
import { OpeningHours } from "./opening-hours";
import { Note, Section } from "./storefront-section";

/**
 * The two answers to "Do customers come here?" (DEC-069, KTD-12): the
 * `SHOP` and `ONLINE` kinds, said as the answer to the question. Lists
 * elsewhere name the kinds "Customers visit" and "No counter".
 */
export const KIND_ANSWER: Record<StorefrontKind, string> = {
    SHOP: "Yes, they visit",
    ONLINE: "No, online only",
};

/**
 * The place: its name, whether customers come here, and only for a place
 * they visit, its address and opening hours. Last, its description and
 * logo as one read-first row (what is saved, and Edit to their own page),
 * as Delivery draws its ways. The people who work here are the People tab.
 */
export function PlaceSection({
    store,
    canEdit,
    pending,
    save,
    setStore,
    details,
}: SectionProps & {
    /** Left out when they couldn't be read: then there is no row. */
    details?: LocationDetails;
}) {
    const [name, setName] = useState(store.name);
    const trimmed = name.trim();
    const dirty = trimmed !== store.name;

    // A refused change of kind (the plan's places customers visit, UX-036)
    // is said by the radio it stopped, which stays where it was.
    const [kindError, setKindError] = useState<string | null>(null);
    // Becoming a place customers visit asks for its address next.
    const askAddress = useRef(false);
    const setKind = (kind: StorefrontKind) => {
        if (kind === store.kind) return;
        const before = store.kind;
        setKindError(null);
        askAddress.current = kind === "SHOP" && !store.address?.trim();
        setStore((s) => ({ ...s, kind }));
        save(
            { kind },
            kind === "SHOP"
                ? "Customers visit this location now"
                : "This location has no counter now",
            () => {
                askAddress.current = false;
                setStore((s) => ({ ...s, kind: before }));
            },
            setKindError,
        );
    };
    // Going online only leaves a saved Pick-up as it was; one press here
    // turns it off, rather than leaving the two to contradict each other.
    const ways = store.fulfilmentTypes;
    const pickupLeftOn =
        canEdit && store.kind === "ONLINE" && Boolean(ways?.includes("PICKUP"));
    const turnPickupOff = () => {
        if (!ways) return;
        const next = ways.filter((t) => t !== "PICKUP");
        setStore((s) => ({ ...s, fulfilmentTypes: next }));
        save({ fulfilmentTypes: next }, "Pick-up turned off", () =>
            setStore((s) => ({ ...s, fulfilmentTypes: ways })),
        );
    };
    useEffect(() => {
        if (!askAddress.current || pending) return;
        askAddress.current = false;
        if (store.kind === "SHOP") jumpTo(ADDRESS_FIELD_ID);
    }, [pending, store.kind]);

    return (
        <Section
            title={LOCATION_SECTIONS.place.label}
            id={LOCATION_SECTIONS.place.id}
        >
            <form
                className="grid gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (dirty && trimmed) save({ name: trimmed }, "Name saved");
                }}
            >
                <Label htmlFor="storefront-name">Location name</Label>
                <div className="flex flex-wrap gap-2">
                    <Input
                        id="storefront-name"
                        value={name}
                        maxLength={80}
                        readOnly={!canEdit}
                        aria-describedby="storefront-name-note"
                        onChange={(e) => setName(e.target.value)}
                        className="min-w-0 max-w-sm flex-[1_1_220px]"
                    />
                    {canEdit && dirty ? (
                        <Button type="submit" disabled={pending || !trimmed}>
                            Save
                        </Button>
                    ) : null}
                </div>
                <Note id="storefront-name-note">
                    Shown at checkout and on receipts. Name the place, like
                    &ldquo;Hill Road&rdquo;.
                </Note>
            </form>

            <div className="grid gap-2">
                <p id="location-kind-label" className="text-sm font-medium">
                    Do customers come here?
                </p>
                <ToggleGroup
                    type="single"
                    value={store.kind}
                    // Radix clears a single group when the pressed item is
                    // pressed again; a location is always one or the other.
                    onValueChange={(v) => {
                        if (v === "SHOP" || v === "ONLINE") setKind(v);
                    }}
                    disabled={!canEdit || pending}
                    id={KIND_FIELD_ID}
                    aria-labelledby="location-kind-label"
                    aria-describedby={
                        kindError ? "location-kind-error" : undefined
                    }
                    className={SEGMENTED}
                >
                    <ToggleGroupItem value="SHOP" className={SEGMENT}>
                        {KIND_ANSWER.SHOP}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="ONLINE" className={SEGMENT}>
                        {KIND_ANSWER.ONLINE}
                    </ToggleGroupItem>
                </ToggleGroup>
                {kindError ? (
                    <p
                        id="location-kind-error"
                        role="alert"
                        className="text-pretty text-[12.5px] font-medium leading-[1.5] text-destructive-subtle-foreground"
                    >
                        {kindError}
                    </p>
                ) : null}
                {pickupLeftOn ? (
                    // No counter, but Pick-up still on (just switched, or
                    // saved that way before): the way out, right here.
                    <div
                        role="status"
                        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-muted px-3 py-2.5 text-[12.5px] leading-[1.5]"
                    >
                        <span className="min-w-0 flex-[1_1_220px]">
                            Pick-up is still on, but with no counter nobody can
                            collect from here.
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
            </div>

            {/* Only a place customers visit has a door: where it is and
                when it is open. */}
            {store.kind === "SHOP" ? (
                <>
                    <AddressField
                        key={store.address ?? ""}
                        saved={store.address}
                        canEdit={canEdit}
                        pending={pending}
                        onSave={(address) => {
                            save({ address }, "Location address saved");
                        }}
                    />
                    <OpeningHours
                        saved={store.openingHours}
                        canEdit={canEdit}
                        pending={pending}
                        onSave={(openingHours) => {
                            save({ openingHours }, "Opening hours saved");
                        }}
                    />
                </>
            ) : null}

            {details ? (
                <Rows>
                    <Row
                        id="location-details"
                        label="Description and logo"
                        action={
                            <Button asChild size="sm" variant="outline">
                                <Link
                                    href={storefrontDetailsHref(store.id)}
                                    aria-label="Edit description and logo"
                                >
                                    Edit
                                </Link>
                            </Button>
                        }
                    >
                        <span data-testid="location-details-summary">
                            {detailsEmpty(details) ? (
                                <Absent>{detailsSummary(details)}</Absent>
                            ) : (
                                detailsSummary(details)
                            )}
                        </span>
                    </Row>
                </Rows>
            ) : null}
        </Section>
    );
}

function AddressField({
    saved,
    canEdit,
    pending,
    onSave,
}: {
    saved: string | null;
    canEdit: boolean;
    pending: boolean;
    onSave: (address: string | null) => void;
}) {
    const [address, setAddress] = useState(saved ?? "");
    const dirty = address.trim() !== (saved ?? "");
    return (
        <form
            className="grid gap-2"
            onSubmit={(e) => {
                e.preventDefault();
                if (dirty) onSave(address.trim() || null);
            }}
        >
            <Label htmlFor={ADDRESS_FIELD_ID}>Location address</Label>
            <Textarea
                id={ADDRESS_FIELD_ID}
                value={address}
                rows={3}
                maxLength={500}
                readOnly={!canEdit}
                aria-describedby="storefront-address-note"
                onChange={(e) => setAddress(e.target.value)}
                className="max-w-md scroll-mt-24"
            />
            <Note id="storefront-address-note">
                Printed on receipts, and where pick-up orders are collected.
            </Note>
            {canEdit && dirty ? (
                <Button type="submit" disabled={pending} className="w-fit">
                    Save address
                </Button>
            ) : null}
        </form>
    );
}
