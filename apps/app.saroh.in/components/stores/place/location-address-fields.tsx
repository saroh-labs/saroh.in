"use client";

import { Refusal } from "@/components/shared/states/refusal";
import { MAP_LINK_MAX } from "@saroh/block-contract";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";

import type { AddressDraft } from "@/lib/stores/location-address";
import { MAP_LINK, readMapLink } from "@/lib/stores/location-address";
import { ADDRESS_FIELD_ID } from "@/lib/stores/location-readiness";

import { Note } from "@/components/stores/locations/storefront-section";

const PROBLEM =
    "text-pretty text-[12.5px] font-medium leading-[1.5] text-destructive-subtle-foreground";

/** The Google Maps link field's id, beside the address's. */
export const MAP_LINK_FIELD_ID = "storefront-map-link";

/**
 * A location's address and its Google Maps link (DEC-128): the fields of
 * the location's Address sheet, and of the same edit made in place from
 * Website settings. The address with its limit and note; the link with
 * what it accepts as its placeholder and, under it, where Get directions
 * will open as it is typed, or what is wrong with it once the field is
 * left or Save was tried (`showProblems`).
 *
 * Controlled: the sheet holds the draft and saves it
 * (`lib/stores/location-address.ts`).
 */
export function LocationAddressFields({
    draft,
    onChange,
    showProblems,
    onLeaveLink,
    disabled = false,
    refusal = null,
}: {
    draft: AddressDraft;
    onChange: (next: AddressDraft) => void;
    /** Say what is wrong with the link: it was left, or Save was tried. */
    showProblems: boolean;
    onLeaveLink: () => void;
    disabled?: boolean;
    /** What the API refused, said under the fields. */
    refusal?: string | null;
}) {
    const link = readMapLink(draft.mapUrl);
    const problem =
        showProblems && link.kind === "problem" ? link.problem : null;

    return (
        <>
            <Label htmlFor={ADDRESS_FIELD_ID}>Location address</Label>
            <Textarea
                id={ADDRESS_FIELD_ID}
                name="address"
                value={draft.address}
                rows={4}
                maxLength={500}
                disabled={disabled}
                aria-describedby="storefront-address-note"
                onChange={(e) =>
                    onChange({ ...draft, address: e.target.value })
                }
            />
            <Note id="storefront-address-note">
                Printed on receipts, and where pick-up orders are collected.
                Your website shows it.
            </Note>

            <Label htmlFor={MAP_LINK_FIELD_ID} className="mt-3">
                {MAP_LINK.label}
            </Label>
            <Input
                id={MAP_LINK_FIELD_ID}
                name="mapUrl"
                value={draft.mapUrl}
                placeholder={MAP_LINK.placeholder}
                maxLength={MAP_LINK_MAX}
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={disabled}
                aria-invalid={problem ? true : undefined}
                aria-describedby="storefront-map-link-note"
                onChange={(e) => onChange({ ...draft, mapUrl: e.target.value })}
                onBlur={onLeaveLink}
            />
            <div id="storefront-map-link-note">
                {problem ? (
                    <p role="alert" className={PROBLEM}>
                        {problem}
                    </p>
                ) : link.kind === "opens" ? (
                    <Note>
                        {MAP_LINK.opens}{" "}
                        <span className="font-mono text-foreground [overflow-wrap:anywhere]">
                            {link.shown}
                        </span>
                    </Note>
                ) : (
                    <Note>{MAP_LINK.note}</Note>
                )}
            </div>
            <Refusal>{refusal}</Refusal>
        </>
    );
}
