"use client";

import { MAP_LINK_MAX } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Switch } from "@saroh/ui/switch";
import Link from "next/link";
import { useState } from "react";

import { FormSheet } from "@/components/shared/form-sheet";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { LocationAddressFields } from "@/components/stores/location-address-fields";
import { saveOrganizationSettings } from "@/lib/organizations/settings-actions";
import type {
    OrganizationSettings,
    SiteContact,
} from "@/lib/organizations/settings-service";
import { SETTINGS_ROW_ID } from "@/lib/sites/settings-edit";
import {
    ADDRESS_SHEET,
    addressLine,
    addressSavedWords,
} from "@/lib/sites/site-contact";
import {
    addressDraftOf,
    addressPatch,
    MAP_LINK,
    mapLinkFieldValue,
    mapLinkProblem,
    readMapLink,
} from "@/lib/stores/location-address";
import { updateStorefront } from "@/lib/stores/storefront-actions";
import type { VisitedLocation } from "@/lib/stores/storefronts";

/** Sell › Locations, for a business with no location customers visit yet. */
const LOCATIONS_HREF = "/commerce/locations";

const PROBLEM =
    "text-pretty text-[12.5px] font-medium leading-[1.5] text-destructive-subtle-foreground";
const NOTE = "text-pretty text-[12.5px] leading-normal text-muted-foreground";

/** A location's Edit in the list, which takes the keyboard back. */
const locationEditId = (id: string) => `site-address-location-${id}-edit`;

/**
 * The address the website shows (DEC-125), in its row's sheet, finished
 * here (owner, 10 Oct): nobody is sent to Sell to change an address.
 *
 * The site shows where customers come, so the sheet lists each location
 * customers visit with its address, and each Edit opens that location's
 * address and Google Maps link right here: the location's own fields
 * (`LocationAddressFields`), saved through the location's own update
 * (`updateStorefront`), which decides who may. Someone who may change the
 * site but not a location reads the addresses and is told who can.
 *
 * With no location customers visit, it says an address appears once one
 * has one, and holds the one choice that is the website's own: whether the
 * registered address stands in, with its own Google Maps link. Off unless
 * the owner turns it on, since a registered address is often a home.
 *
 * A refusal keeps the sheet open with what was typed.
 */
export function SiteAddressSheet({
    contact,
    locations,
    canEditLocations,
    chosen,
    registeredMapUrl,
    registeredSet,
    open,
    returnTo,
    onClose,
    onSaved,
    onLocationSaved,
}: {
    /** What the website shows now, for someone who can't read locations. */
    contact: SiteContact;
    /** The locations customers visit; null when they couldn't be read. */
    locations: VisitedLocation[] | null;
    /** May change a location (`store:write`). */
    canEditLocations: boolean;
    /** The registered address is chosen, as saved. */
    chosen: boolean;
    /** The registered address's Google Maps link, as saved. */
    registeredMapUrl: string | null;
    /** The business has a registered address to show. */
    registeredSet: boolean;
    open: boolean;
    returnTo: string;
    onClose: () => void;
    /** The registered address choice saved: the settings now. */
    onSaved: (next: OrganizationSettings, said: string) => void;
    /** A location's address saved, as the API answered. */
    onLocationSaved: (next: VisitedLocation, said: string) => void;
}) {
    const id = `${SETTINGS_ROW_ID["contact-address"]}-panel`;
    // The location being edited in place, or none: the list.
    const [editingId, setEditingId] = useState<string | null>(null);
    const editing = locations?.find((l) => l.id === editingId) ?? null;

    if (editing) {
        return (
            <LocationAddressEdit
                key={editing.id}
                id={id}
                location={editing}
                open={open}
                // Back in the list, the keyboard returns to this
                // location's Edit; closed outright, to the row's.
                returnTo={returnTo}
                onBack={() => {
                    setEditingId(null);
                    requestAnimationFrame(() =>
                        document
                            .getElementById(locationEditId(editing.id))
                            ?.focus(),
                    );
                }}
                onSaved={onLocationSaved}
            />
        );
    }

    // What the list shows: the locations themselves where they can be
    // read, else what the website shows of them.
    const listed: {
        id: string | null;
        name: string | null;
        address: string | null;
        mapUrl: string | null;
    }[] =
        locations ??
        contact.places
            .filter((p) => p.source === "location")
            .map((p) => ({
                id: null,
                name: p.name,
                address: p.address,
                mapUrl: p.mapUrl ?? null,
            }));

    if (listed.length > 0) {
        return (
            <FormSheet
                id={id}
                returnFocusTo={returnTo}
                title={ADDRESS_SHEET.title}
                description={ADDRESS_SHEET.description}
                open={open}
                pending={false}
                doneOnly
                onClose={onClose}
                onSubmit={(e) => {
                    e.preventDefault();
                    onClose();
                }}
            >
                <div className="grid gap-3 text-sm">
                    <p className="text-pretty">{ADDRESS_SHEET.fromLocations}</p>
                    {!canEditLocations || !locations ? (
                        <ReadOnlyNote className="mb-0">
                            {ADDRESS_SHEET.readOnly}
                        </ReadOnlyNote>
                    ) : null}
                    <ul className="grid gap-2">
                        {listed.map((place) => (
                            <li
                                key={
                                    place.id ?? `${place.name}|${place.address}`
                                }
                                data-location={place.id ?? undefined}
                                className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                            >
                                <div className="min-w-0">
                                    <p className="font-medium [overflow-wrap:anywhere]">
                                        {place.name}
                                    </p>
                                    <p className="[overflow-wrap:anywhere]">
                                        {place.address?.trim() ? (
                                            addressLine(place.address)
                                        ) : (
                                            <span className="text-muted-foreground">
                                                {ADDRESS_SHEET.noAddress}
                                            </span>
                                        )}
                                    </p>
                                    {place.address?.trim() ? (
                                        <p className={NOTE}>
                                            {place.mapUrl
                                                ? ADDRESS_SHEET.directionsOwn
                                                : ADDRESS_SHEET.directionsSearch}
                                        </p>
                                    ) : null}
                                </div>
                                {canEditLocations && locations && place.id ? (
                                    <Button
                                        id={locationEditId(place.id)}
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="shrink-0"
                                        aria-label={`${
                                            place.address?.trim()
                                                ? "Edit"
                                                : "Add"
                                        } address of ${place.name}`}
                                        onClick={() => setEditingId(place.id)}
                                    >
                                        {place.address?.trim()
                                            ? "Edit"
                                            : "Add address"}
                                    </Button>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                    <p className={NOTE}>{ADDRESS_SHEET.whileLocations}</p>
                </div>
            </FormSheet>
        );
    }

    return (
        <RegisteredAddressChoice
            id={id}
            chosen={chosen}
            mapUrl={registeredMapUrl}
            registeredSet={registeredSet}
            open={open}
            returnTo={returnTo}
            onClose={onClose}
            onSaved={onSaved}
        />
    );
}

/**
 * One location's address and Google Maps link, edited in the open sheet:
 * the location's own fields and its own update. Save and Cancel both come
 * back to the list.
 */
function LocationAddressEdit({
    id,
    location,
    open,
    returnTo,
    onBack,
    onSaved,
}: {
    id: string;
    location: VisitedLocation;
    open: boolean;
    returnTo: string;
    onBack: () => void;
    onSaved: (next: VisitedLocation, said: string) => void;
}) {
    const [draft, setDraft] = useState(() => addressDraftOf(location));
    const [tried, setTried] = useState(false);
    const [left, setLeft] = useState(false);
    const [refusal, setRefusal] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    async function save() {
        setTried(true);
        if (mapLinkProblem(draft.mapUrl)) return;
        const patch = addressPatch(draft, location);
        if (Object.keys(patch).length === 0) {
            onBack();
            return;
        }
        setRefusal(null);
        setSaving(true);
        const result = await updateStorefront(location.id, patch);
        setSaving(false);
        if (!result.ok) {
            setRefusal(result.error);
            return;
        }
        onSaved(
            {
                id: location.id,
                name: result.data.name,
                address: result.data.address,
                mapUrl: result.data.mapUrl ?? null,
            },
            "Location address saved. Your website shows it now.",
        );
        onBack();
    }

    return (
        <FormSheet
            id={id}
            returnFocusTo={returnTo}
            title={`${location.name}: address`}
            description="Where customers come to this location."
            open={open}
            pending={saving}
            // Cancel, Escape and the close button drop the draft and come
            // back to the list of locations.
            onClose={onBack}
            onSubmit={(e) => {
                e.preventDefault();
                void save();
            }}
        >
            <LocationAddressFields
                draft={draft}
                onChange={(next) => {
                    setRefusal(null);
                    setDraft(next);
                }}
                showProblems={tried || left}
                onLeaveLink={() => setLeft(true)}
                disabled={saving}
                refusal={refusal}
            />
        </FormSheet>
    );
}

/**
 * No location customers visit: the registered address may stand in, by the
 * owner's choice, with its own Google Maps link for Get directions.
 */
function RegisteredAddressChoice({
    id,
    chosen,
    mapUrl,
    registeredSet,
    open,
    returnTo,
    onClose,
    onSaved,
}: {
    id: string;
    chosen: boolean;
    mapUrl: string | null;
    registeredSet: boolean;
    open: boolean;
    returnTo: string;
    onClose: () => void;
    onSaved: (next: OrganizationSettings, said: string) => void;
}) {
    const savedLink = mapLinkFieldValue(mapUrl);
    const [show, setShow] = useState(chosen);
    const [link, setLink] = useState(savedLink);
    const [touched, setTouched] = useState(false);
    const [saving, setSaving] = useState(false);
    const [refusal, setRefusal] = useState<string | null>(null);
    const [linkRefusal, setLinkRefusal] = useState<string | null>(null);
    const read = readMapLink(link);
    const linkProblem =
        linkRefusal ??
        (touched && read.kind === "problem" ? read.problem : null);

    async function save() {
        setTouched(true);
        // The link is the shown address's: with the address off, what was
        // typed for it is left as it is saved.
        if (show && read.kind === "problem") return;
        const nextLink = read.kind === "opens" ? read.url : null;
        const sent = {
            ...(show !== chosen ? { siteShowsRegisteredAddress: show } : {}),
            ...(show && nextLink !== mapUrl
                ? { registeredAddressMapUrl: link.trim() }
                : {}),
        };
        if (Object.keys(sent).length === 0) {
            onClose();
            return;
        }
        setRefusal(null);
        setSaving(true);
        const result = await saveOrganizationSettings(sent);
        setSaving(false);
        if (!result.ok) {
            if (result.field === "registeredAddressMapUrl") {
                setLinkRefusal(result.error);
            } else setRefusal(result.error);
            return;
        }
        onSaved(
            result.data,
            show !== chosen
                ? addressSavedWords(show)
                : ADDRESS_SHEET.mapLinkSaved,
        );
        onClose();
    }

    return (
        <FormSheet
            id={id}
            returnFocusTo={returnTo}
            title={ADDRESS_SHEET.title}
            description={ADDRESS_SHEET.description}
            open={open}
            pending={saving}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                void save();
            }}
        >
            <div className="grid gap-4 text-sm">
                <p className="text-pretty">
                    {ADDRESS_SHEET.noLocation}{" "}
                    <Link
                        href={LOCATIONS_HREF}
                        className="font-medium underline underline-offset-2 hover:text-foreground active:text-muted-foreground"
                    >
                        Open Locations
                    </Link>
                </p>

                <div className="grid gap-1.5">
                    <div className="flex items-center justify-between gap-4">
                        <Label htmlFor={`${id}-switch`} className="font-medium">
                            {ADDRESS_SHEET.switchLabel}
                        </Label>
                        <Switch
                            id={`${id}-switch`}
                            checked={show}
                            disabled={saving}
                            onCheckedChange={(on) => {
                                setRefusal(null);
                                setShow(on);
                            }}
                            aria-describedby={`${id}-note`}
                        />
                    </div>
                    <p id={`${id}-note`} className={NOTE}>
                        {ADDRESS_SHEET.switchNote}{" "}
                        {show && !registeredSet
                            ? ADDRESS_SHEET.registeredMissing
                            : null}
                    </p>
                </div>

                {show ? (
                    <div className="grid gap-1.5">
                        <Label htmlFor={`${id}-map`}>{MAP_LINK.label}</Label>
                        <Input
                            id={`${id}-map`}
                            name="registeredAddressMapUrl"
                            value={link}
                            placeholder={MAP_LINK.placeholder}
                            maxLength={MAP_LINK_MAX}
                            inputMode="url"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            disabled={saving}
                            aria-invalid={linkProblem ? true : undefined}
                            aria-describedby={`${id}-map-note`}
                            onChange={(e) => {
                                setLinkRefusal(null);
                                setRefusal(null);
                                setLink(e.target.value);
                            }}
                            onBlur={() => setTouched(true)}
                        />
                        <div id={`${id}-map-note`}>
                            {linkProblem ? (
                                <p role="alert" className={PROBLEM}>
                                    {linkProblem}
                                </p>
                            ) : read.kind === "opens" ? (
                                <p className={NOTE}>
                                    {MAP_LINK.opens}{" "}
                                    <span className="font-mono text-foreground [overflow-wrap:anywhere]">
                                        {read.shown}
                                    </span>
                                </p>
                            ) : (
                                <p className={NOTE}>{MAP_LINK.note}</p>
                            )}
                        </div>
                    </div>
                ) : null}

                {refusal ? (
                    <p role="alert" className={PROBLEM}>
                        {refusal}
                    </p>
                ) : null}
            </div>
        </FormSheet>
    );
}
