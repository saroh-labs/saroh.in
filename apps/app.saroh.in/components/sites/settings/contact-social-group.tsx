"use client";

import { parseSocialLinks } from "@saroh/block-contract";
import { FailedState } from "@saroh/ui/data-state";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BusinessFieldSheet } from "@/components/organizations/business-field-sheet";
import {
    addressText,
    valuesOf,
} from "@/components/organizations/business-form";
import { SocialLinksSheet } from "@/components/organizations/social-links-sheet";
import { Absent, Group, Row, Section } from "@/components/sites/settings-rows";
import { phoneLabel } from "@/lib/organizations/business-phone";
import { savedWords } from "@/lib/organizations/business-sheet-words";
import type {
    OrganizationSettings,
    SiteContactView,
} from "@/lib/organizations/settings-service";
import { socialRowSummary } from "@/lib/organizations/social-links";
import type { SettingsSheet } from "@/lib/sites/settings-edit";
import { SETTINGS_ROW_ID, settingsEditId } from "@/lib/sites/settings-edit";
import {
    addressRowLines,
    CONTACT_EMPTY,
    CONTACT_LEAD,
    CONTACT_OWNER_ONLY,
    CONTACT_UNREAD,
} from "@/lib/sites/site-contact";
import type { VisitedLocation } from "@/lib/stores/storefronts";

import { FailedRead } from "@/components/shared/failed-read";
import { EditAction } from "./edit-actions";
import { SiteAddressSheet } from "./site-address-sheet";
import type { SettingsSave } from "./use-settings-save";

/** The group's sheets. */
export const CONTACT_SHEETS = [
    "contact-phone",
    "contact-email",
    "contact-address",
    "contact-social",
] as const satisfies readonly SettingsSheet[];

/**
 * Contact and social (DEC-128): what the website shows of how to reach the
 * business — its phone, its email, where customers come and its social
 * links — each a row saying what the site shows, read from the same read
 * the site's footer draws.
 *
 * They are the business's own details, the same on its invoices and its
 * site, so they are kept in Settings › Business. But a merchant finishes
 * the task where they started it: each Edit opens the business's own sheet
 * right here (the phone's, the email's, the social links'), and the
 * address's sheet holds the one choice that is the website's.
 *
 * None of it is draft: a save shows on the website at once, with no
 * publish, as the phone always did. So no row carries "Next publish".
 *
 * `business` is the business's settings for someone who may change them
 * (owner or admin); without it the rows are read-only and say who can.
 * `state` is absent for someone who can't change the site either.
 */
export function ContactSocialGroup({
    view,
    business: initial,
    state,
    locations: initialLocations = null,
    canEditLocations = false,
}: {
    /**
     * The locations customers visit, whose addresses the Address sheet
     * edits in place; null when they couldn't be read (Sell off, or a
     * role the API won't show them to).
     */
    locations?: VisitedLocation[] | null;
    /** May change a location (`store:write`). */
    canEditLocations?: boolean;
    /** What the website shows; null when it couldn't be read. */
    view: SiteContactView | null;
    business: OrganizationSettings | null;
    state: SettingsSave | null;
}) {
    const router = useRouter();
    // What the last save answered, so a row reads it at once.
    const [business, setBusiness] = useState(initial);
    const [locations, setLocations] = useState(initialLocations);
    const canEdit = state !== null && business !== null;
    const editing = canEdit ? state.editing : null;

    if (!view && !business) {
        return (
            <Group id="contact" title="Contact and social">
                <FailedState
                    data-ph-unmask=""
                    size="panel"
                    title={CONTACT_UNREAD.title}
                    description={CONTACT_UNREAD.description}
                    onRetry={() => router.refresh()}
                />
            </Group>
        );
    }

    // The business's settings are the freshest where they are in hand; the
    // site's own read otherwise.
    const phone = business
        ? (business.profile?.phone ?? null)
        : (view?.contact.phone ?? null);
    const email = business
        ? (business.profile?.contactEmail ?? null)
        : (view?.contact.email ?? null);
    const social = business
        ? (business.socialLinks ?? {})
        : parseSocialLinks(
              Object.fromEntries(
                  (view?.contact.social ?? []).map((s) => [s.network, s.url]),
              ),
          );
    const linked = Object.keys(social).length > 0;
    const places = view?.contact.places ?? [];
    const lines = addressRowLines(places);
    const chosen =
        business?.siteShowsRegisteredAddress ??
        view?.registeredAddressChosen ??
        false;

    const saved = (next: OrganizationSettings, said: string) => {
        setBusiness(next);
        showSuccess(said);
        // The address the site shows is the API's to work out.
        router.refresh();
    };
    const edit = (row: SettingsSheet, set: boolean, what: string) =>
        canEdit ? (
            <EditAction
                row={row}
                state={state}
                label={set ? "Edit" : "Add"}
                name={`${set ? "Edit" : "Add"} ${what}`}
            />
        ) : undefined;
    const sheet = (row: SettingsSheet) =>
        editing?.which === row
            ? {
                  key: editing.opened,
                  open: editing.open,
                  returnTo: settingsEditId(row),
                  onClose: state?.close ?? (() => undefined),
              }
            : null;
    const phoneSheet = sheet("contact-phone");
    const emailSheet = sheet("contact-email");
    const addressSheet = sheet("contact-address");
    const socialSheet = sheet("contact-social");

    return (
        <Group id="contact" title="Contact and social">
            <Section
                title="Contact and social"
                description={
                    state !== null && business === null
                        ? `${CONTACT_LEAD} ${CONTACT_OWNER_ONLY}`
                        : CONTACT_LEAD
                }
            >
                <Row
                    id={SETTINGS_ROW_ID["contact-phone"]}
                    label="Phone"
                    action={edit("contact-phone", Boolean(phone), "phone")}
                >
                    {phone ? (
                        <span className="font-mono">{phoneLabel(phone)}</span>
                    ) : (
                        <Absent>{CONTACT_EMPTY.phone}</Absent>
                    )}
                </Row>
                <Row
                    id={SETTINGS_ROW_ID["contact-email"]}
                    label="Email"
                    action={edit("contact-email", Boolean(email), "email")}
                >
                    {email ? (
                        <span className="[overflow-wrap:anywhere]">
                            {email}
                        </span>
                    ) : (
                        <Absent>{CONTACT_EMPTY.email}</Absent>
                    )}
                </Row>
                <Row
                    id={SETTINGS_ROW_ID["contact-address"]}
                    label="Address"
                    action={
                        canEdit && view ? (
                            <EditAction
                                row="contact-address"
                                state={state}
                                label="Edit"
                                name="Edit address on your website"
                            />
                        ) : undefined
                    }
                >
                    {!view ? (
                        <FailedRead things="your address" />
                    ) : lines.length > 0 ? (
                        <span className="grid gap-0.5">
                            {lines.map((line) => (
                                <span
                                    key={line}
                                    className="[overflow-wrap:anywhere]"
                                >
                                    {line}
                                </span>
                            ))}
                        </span>
                    ) : (
                        <Absent>{CONTACT_EMPTY.address}</Absent>
                    )}
                </Row>
                <Row
                    id={SETTINGS_ROW_ID["contact-social"]}
                    label="Social links"
                    action={edit("contact-social", linked, "social links")}
                >
                    {linked ? (
                        <span className="[overflow-wrap:anywhere]">
                            {socialRowSummary(social)}
                        </span>
                    ) : (
                        <Absent>{CONTACT_EMPTY.social}</Absent>
                    )}
                </Row>
            </Section>

            {/* The open sheet, a fresh draft each time it opens: the
                business's own sheets, so there is one of each. */}
            {business && phoneSheet ? (
                <BusinessFieldSheet
                    {...phoneSheet}
                    sheet="phone"
                    settings={business}
                    onSaved={(next) =>
                        saved(
                            next,
                            `${savedWords("phone", { kind: next.kind, registered: false })}. Your website shows it now.`,
                        )
                    }
                />
            ) : null}
            {business && emailSheet ? (
                <BusinessFieldSheet
                    {...emailSheet}
                    sheet="contactEmail"
                    settings={business}
                    onSaved={(next) =>
                        saved(
                            next,
                            `${savedWords("contactEmail", { kind: next.kind, registered: false })}. Your website shows it now.`,
                        )
                    }
                />
            ) : null}
            {business && view && addressSheet ? (
                <SiteAddressSheet
                    {...addressSheet}
                    contact={view.contact}
                    locations={locations}
                    canEditLocations={canEditLocations}
                    chosen={chosen}
                    registeredMapUrl={business.registeredAddressMapUrl ?? null}
                    registeredSet={addressText(valuesOf(business)) !== ""}
                    onSaved={saved}
                    onLocationSaved={(next, said) => {
                        setLocations(
                            (all) =>
                                all?.map((l) =>
                                    l.id === next.id ? next : l,
                                ) ?? all,
                        );
                        showSuccess(said);
                        // The row reads what the website shows.
                        router.refresh();
                    }}
                />
            ) : null}
            {business && socialSheet ? (
                <SocialLinksSheet
                    {...socialSheet}
                    links={business.socialLinks}
                    phone={business.profile?.phone}
                    kind={business.kind}
                    onSaved={saved}
                />
            ) : null}
        </Group>
    );
}
