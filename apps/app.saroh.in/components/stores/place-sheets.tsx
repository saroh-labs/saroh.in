"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@saroh/ui/toggle-group";
import type { FormEventHandler, ReactNode } from "react";
import { useState } from "react";

import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";
import { SettingsSheetFrame } from "@/components/shared/settings-sheet-frame";
import {
    ADDRESS_FIELD_ID,
    KIND_FIELD_ID,
} from "@/lib/stores/location-readiness";
import { hoursBackwards } from "@/lib/stores/opening-hours-summary";
import type { PlaceSheet } from "@/lib/stores/place-rows";
import {
    KIND_ANSWER,
    KIND_FOLLOWS,
    PLACE_ROW_ID,
    placeEditId,
} from "@/lib/stores/place-rows";
import type {
    OpeningHoursDay,
    StorefrontKind,
    StorefrontSettings,
} from "@/lib/stores/storefronts";

import type { Saver } from "./location-save";
import { DEFAULT_WEEK, OpeningHoursFields } from "./opening-hours";
import { Note } from "./storefront-section";

const PROBLEM =
    "text-pretty text-[12.5px] font-medium leading-[1.5] text-destructive-subtle-foreground";

/**
 * The frame every Edit sheet in The place shares: the settings rows' own
 * (`components/shared/settings-sheet-frame.tsx`, which says how it saves,
 * closes and hands the keyboard back), named by the row it edits.
 */
export function PlaceSheetFrame({
    sheet,
    ...frame
}: {
    sheet: PlaceSheet;
    title: string;
    description: string;
    open: boolean;
    pending: boolean;
    onClose: () => void;
    onSubmit: FormEventHandler<HTMLFormElement>;
    children: ReactNode;
}) {
    return (
        <SettingsSheetFrame
            id={`${PLACE_ROW_ID[sheet]}-panel`}
            returnFocusTo={placeEditId(sheet)}
            {...frame}
        />
    );
}

interface SheetProps {
    store: StorefrontSettings;
    open: boolean;
    pending: boolean;
    save: Saver;
    onClose: () => void;
}

/** The location's name: the one field, with its note and its limit. */
export function PlaceNameSheet({
    store,
    open,
    pending,
    save,
    onClose,
}: SheetProps) {
    const [name, setName] = useState(store.name);
    const [tried, setTried] = useState(false);
    const trimmed = name.trim();
    const missing = tried && !trimmed;

    return (
        <PlaceSheetFrame
            sheet="name"
            title="Name"
            description="What this location is called."
            open={open}
            pending={pending}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                setTried(true);
                if (!trimmed) return;
                if (trimmed === store.name) {
                    onClose();
                    return;
                }
                save(
                    { name: trimmed },
                    "Name saved",
                    undefined,
                    undefined,
                    onClose,
                );
            }}
        >
            <Label htmlFor="storefront-name">Location name</Label>
            <Input
                id="storefront-name"
                value={name}
                maxLength={80}
                aria-invalid={missing || undefined}
                aria-describedby="storefront-name-note"
                onChange={(e) => setName(e.target.value)}
            />
            {missing ? (
                <p id="storefront-name-note" role="alert" className={PROBLEM}>
                    Name is required
                </p>
            ) : (
                <Note id="storefront-name-note">
                    Shown at checkout and on receipts. Name the place, like
                    &ldquo;Hill Road&rdquo;.
                </Note>
            )}
        </PlaceSheetFrame>
    );
}

/**
 * "Do customers come here?": the two answers, and what follows from the
 * one picked. A refusal (the plan's places customers visit, UX-036) is
 * said by the choice it stopped, and the row stays where it was.
 *
 * Going online only keeps the address and hours (the API hides them, it
 * doesn't clear them) and leaves a saved Pick-up as it was: the row offers
 * turning that off afterwards.
 */
export function PlaceKindSheet({
    store,
    open,
    pending,
    save,
    setStore,
    onClose,
    onVisited,
}: SheetProps & {
    setStore: (fn: (s: StorefrontSettings) => StorefrontSettings) => void;
    /** Saved as a place customers visit: its address is asked next. */
    onVisited: () => void;
}) {
    // What was saved when the sheet opened; `store` moves with the save.
    const [before] = useState(store.kind);
    const [kind, setKind] = useState<StorefrontKind>(store.kind);
    const [error, setError] = useState<string | null>(null);

    return (
        <PlaceSheetFrame
            sheet="kind"
            title="Do customers come here?"
            description="Whether this location has a counter customers can come to."
            open={open}
            pending={pending}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                if (kind === before) {
                    onClose();
                    return;
                }
                setError(null);
                setStore((s) => ({ ...s, kind }));
                save(
                    { kind },
                    kind === "SHOP"
                        ? "Customers visit this location now"
                        : "This location has no counter now",
                    () => setStore((s) => ({ ...s, kind: before })),
                    setError,
                    () => {
                        onClose();
                        if (kind === "SHOP") onVisited();
                    },
                );
            }}
        >
            <ToggleGroup
                type="single"
                value={kind}
                // Radix clears a single group when the pressed item is
                // pressed again; a location is always one or the other.
                onValueChange={(v) => {
                    if (v !== "SHOP" && v !== "ONLINE") return;
                    setKind(v);
                    setError(null);
                }}
                disabled={pending}
                id={KIND_FIELD_ID}
                aria-label="Do customers come here?"
                aria-describedby={
                    error
                        ? "location-kind-error location-kind-note"
                        : "location-kind-note"
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
            {error ? (
                <p id="location-kind-error" role="alert" className={PROBLEM}>
                    {error}
                </p>
            ) : null}
            <Note id="location-kind-note">
                {KIND_FOLLOWS[kind]}
                {before === "SHOP" && kind === "ONLINE"
                    ? " The saved address and hours are kept."
                    : null}
            </Note>
        </PlaceSheetFrame>
    );
}

/** Where customers come: the address, with its limit and its note. */
export function PlaceAddressSheet({
    store,
    open,
    pending,
    save,
    onClose,
}: SheetProps) {
    const saved = store.address ?? "";
    const [address, setAddress] = useState(saved);

    return (
        <PlaceSheetFrame
            sheet="address"
            title="Address"
            description="Where customers come to this location."
            open={open}
            pending={pending}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                if (address.trim() === saved) {
                    onClose();
                    return;
                }
                save(
                    { address: address.trim() || null },
                    "Location address saved",
                    undefined,
                    undefined,
                    onClose,
                );
            }}
        >
            <Label htmlFor={ADDRESS_FIELD_ID}>Location address</Label>
            <Textarea
                id={ADDRESS_FIELD_ID}
                value={address}
                rows={4}
                maxLength={500}
                aria-describedby="storefront-address-note"
                onChange={(e) => setAddress(e.target.value)}
            />
            <Note id="storefront-address-note">
                Printed on receipts, and where pick-up orders are collected.
            </Note>
        </PlaceSheetFrame>
    );
}

/**
 * The week it opens: the opening-hours editor, with Save at the foot. A
 * location that has never saved a week starts from one, and Save keeps it
 * as it stands; a week with a day that closes before it opens isn't sent.
 */
export function PlaceHoursSheet({
    store,
    open,
    pending,
    save,
    onClose,
}: SheetProps) {
    const saved = store.openingHours;
    const [week, setWeek] = useState<OpeningHoursDay[]>(saved ?? DEFAULT_WEEK);

    return (
        <PlaceSheetFrame
            sheet="hours"
            title="Opening hours"
            description="The days this location opens, and the hours it keeps."
            open={open}
            pending={pending}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                if (hoursBackwards(week)) return;
                if (saved && JSON.stringify(week) === JSON.stringify(saved)) {
                    onClose();
                    return;
                }
                save(
                    { openingHours: week },
                    "Opening hours saved",
                    undefined,
                    undefined,
                    onClose,
                );
            }}
        >
            <OpeningHoursFields
                week={week}
                setWeek={setWeek}
                saved={Boolean(saved)}
            />
        </PlaceSheetFrame>
    );
}
