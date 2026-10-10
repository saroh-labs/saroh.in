"use client";

import { Label } from "@saroh/ui/label";
import { Switch } from "@saroh/ui/switch";
import Link from "next/link";
import { useState } from "react";

import { SettingsSheetFrame } from "@/components/shared/settings-sheet-frame";
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
    addressSourceOf,
} from "@/lib/sites/site-contact";

/** Sell › Locations, where a location's own address is edited. */
const LOCATIONS_HREF = "/commerce/locations";

/**
 * The address the website shows (DEC-125), in its row's sheet. The site
 * shows where customers come: each location that says customers visit. So
 * the sheet says which those are, and holds the one choice that is the
 * website's own: whether the registered address stands in while no
 * location has one. Off unless the owner turns it on, since a registered
 * address is often a home.
 *
 * A refusal keeps the sheet open and is said under the switch.
 */
export function SiteAddressSheet({
    contact,
    chosen,
    registeredSet,
    open,
    returnTo,
    onClose,
    onSaved,
}: {
    /** What the website shows now. */
    contact: SiteContact;
    /** The registered address is chosen, as saved. */
    chosen: boolean;
    /** The business has a registered address to show. */
    registeredSet: boolean;
    open: boolean;
    returnTo: string;
    onClose: () => void;
    onSaved: (next: OrganizationSettings, said: string) => void;
}) {
    const [show, setShow] = useState(chosen);
    const [saving, setSaving] = useState(false);
    const [refusal, setRefusal] = useState<string | null>(null);
    const source = addressSourceOf(contact);
    const places = contact.places.filter((p) => p.source === "location");
    const id = `${SETTINGS_ROW_ID["contact-address"]}-panel`;

    async function save() {
        if (show === chosen) {
            onClose();
            return;
        }
        setRefusal(null);
        setSaving(true);
        const result = await saveOrganizationSettings({
            siteShowsRegisteredAddress: show,
        });
        setSaving(false);
        if (!result.ok) {
            setRefusal(result.error);
            return;
        }
        onSaved(result.data, addressSavedWords(show));
        onClose();
    }

    return (
        <SettingsSheetFrame
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
                {source === "locations" ? (
                    <div className="grid gap-2">
                        <p className="text-pretty">
                            {ADDRESS_SHEET.fromLocations}
                        </p>
                        <ul className="grid gap-1.5 rounded-lg bg-muted px-3 py-2.5">
                            {places.map((place) => (
                                <li
                                    key={`${place.name ?? ""}|${place.address}`}
                                    className="[overflow-wrap:anywhere]"
                                >
                                    {place.name ? (
                                        <span className="font-medium">
                                            {place.name}:{" "}
                                        </span>
                                    ) : null}
                                    {addressLine(place.address)}
                                </li>
                            ))}
                        </ul>
                        <p className="text-pretty text-[12.5px] text-muted-foreground">
                            {ADDRESS_SHEET.changeLocation}{" "}
                            <Link
                                href={LOCATIONS_HREF}
                                className="font-medium text-foreground underline underline-offset-2 hover:text-foreground active:text-muted-foreground"
                            >
                                Open Locations
                            </Link>
                        </p>
                    </div>
                ) : (
                    <p className="text-pretty">{ADDRESS_SHEET.noLocation}</p>
                )}

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
                    <p
                        id={`${id}-note`}
                        className="text-pretty text-[12.5px] leading-normal text-muted-foreground"
                    >
                        {ADDRESS_SHEET.switchNote}{" "}
                        {source === "locations"
                            ? ADDRESS_SHEET.whileLocations
                            : show && !registeredSet
                              ? ADDRESS_SHEET.registeredMissing
                              : null}
                    </p>
                    {refusal ? (
                        <p
                            role="alert"
                            className="text-pretty text-[12.5px] font-medium leading-[1.5] text-destructive-subtle-foreground"
                        >
                            {refusal}
                        </p>
                    ) : null}
                </div>
            </div>
        </SettingsSheetFrame>
    );
}
