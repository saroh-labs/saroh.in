"use client";

import {
    addressText,
    valuesOf,
} from "@/components/organizations/business-form";
import {
    KIND_ROW_LABEL,
    kindChoiceLabel,
} from "@/components/organizations/business-kind-field";
import {
    BusinessRows,
    Follows,
    Locked,
    rowActions,
    Saved,
} from "@/components/organizations/business-row-parts";
import {
    BusinessTaxRows,
    TAX_TAB,
} from "@/components/organizations/business-tax-rows";
import { countryName } from "@/components/shared/country-select";
import { Absent, Row } from "@/components/sites/settings-rows";
import { BUSINESS_ROW_ID } from "@/lib/organizations/business-rows";
import { nameLabelOf } from "@/lib/organizations/business-sheet-words";
import {
    businessTypeLabel,
    businessTypeOf,
} from "@/lib/organizations/business-types";
import { kindWords } from "@/lib/organizations/kind";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";
import { zoneLabel } from "@/lib/organizations/time-zones";

import type { BusinessSheets } from "./use-business-sheets";

/** The four tabs whose rows are the business's own details. */
export type DetailTab = "identity" | "contact" | "tax" | "address";

/** Each tab's card: its name, and what it holds in a line. */
export const DETAIL_TABS: Record<DetailTab, { title: string; lead: string }> = {
    identity: {
        title: "Identity",
        lead: "How the business is named and registered",
    },
    contact: { title: "Contact", lead: "How customers reach you" },
    tax: TAX_TAB,
    address: {
        title: "Registered address",
        lead: "Printed under your legal name",
    },
};

/**
 * Identity, Contact, Tax and invoices and Registered address, read first
 * (owner, 10 Oct): each a card of rows in the "label · what is saved · Edit"
 * pattern, one row per thing a merchant thinks of as one fact. Each Edit
 * opens that row's own side sheet (`business-field-sheet.tsx`,
 * `business-logo-sheet.tsx`); a fact nobody sets (trading since, the
 * financial year, a registered business's state) says why instead. Read-only
 * roles see the rows without Edit.
 */
export function BusinessDetailRows({
    tab,
    settings,
    canEdit,
    sheets,
}: {
    tab: DetailTab;
    settings: OrganizationSettings;
    canEdit: boolean;
    sheets: BusinessSheets;
}) {
    const saved = valuesOf(settings);
    // The words of what is saved (DEC-070): an Undo puts them back too.
    const words = kindWords(saved.kind);
    const nameLabel = nameLabelOf(saved.kind);
    const business = saved.kind === "BUSINESS";

    const { edit, editOrAdd } = rowActions(canEdit, sheets);

    if (tab === "identity") {
        const type = businessTypeLabel(saved.type) ?? "";
        // Said Registered at setup and no type chosen since: the take-money
        // checklist holds going live on it, so the row says why.
        const typeAsked =
            settings.profile?.registered === true &&
            businessTypeOf(settings.profile.type) === "";
        const logo = settings.logo?.url ?? null;
        const tradingSince = settings.tradingSince
            ? new Date(settings.tradingSince).getUTCFullYear().toString()
            : "";
        return (
            <BusinessRows
                title={DETAIL_TABS.identity.title}
                lead={
                    business
                        ? DETAIL_TABS.identity.lead
                        : "How you're named and registered"
                }
                note="Invoices are issued in the legal name, if you've set one."
            >
                <Row
                    id={BUSINESS_ROW_ID.kind}
                    label={KIND_ROW_LABEL}
                    action={edit("kind", "Change", "Change what this is")}
                >
                    <Saved text={kindChoiceLabel(saved.kind)} />
                </Row>
                <Row
                    id={BUSINESS_ROW_ID.name}
                    label={nameLabel}
                    action={edit(
                        "name",
                        "Edit",
                        `Edit ${nameLabel.toLowerCase()}`,
                    )}
                >
                    <Saved text={saved.name} />
                </Row>
                <Row
                    id={BUSINESS_ROW_ID.logo}
                    label="Logo"
                    action={editOrAdd(
                        "logo",
                        logo !== null,
                        "logo",
                        "Add logo",
                    )}
                >
                    {logo ? (
                        <span className="flex items-center gap-2.5">
                            {/* eslint-disable-next-line @next/next/no-img-element -- a tenant's own image, outside next/image's allowlist */}
                            <img
                                src={logo}
                                alt="Business logo"
                                className="size-9 flex-none rounded-lg border border-border bg-white object-cover"
                            />
                            <span>On your invoices and receipts</span>
                        </span>
                    ) : (
                        <Absent>No logo yet</Absent>
                    )}
                </Row>
                <Row
                    id={BUSINESS_ROW_ID.legalName}
                    label="Legal name"
                    action={edit("legalName", "Edit", "Edit legal name")}
                >
                    <Saved
                        text={saved.legalName ?? ""}
                        empty="Same as the business name"
                    />
                </Row>
                {/* The go-live checklist's "Choose your business type"
                    lands here, with the sheet open. */}
                <Row
                    id={BUSINESS_ROW_ID.type}
                    label="Type"
                    action={editOrAdd(
                        "type",
                        type !== "",
                        "type",
                        "Choose type",
                    )}
                >
                    <Saved
                        text={type}
                        empty={
                            typeAsked
                                ? "Not chosen yet. You said it's registered."
                                : "Not set"
                        }
                    />
                </Row>
                <Row
                    id={BUSINESS_ROW_ID.timezone}
                    label="Time zone"
                    action={editOrAdd(
                        "timezone",
                        saved.timezone !== "",
                        "time zone",
                        "Set time zone",
                    )}
                >
                    <Saved
                        text={saved.timezone ? zoneLabel(saved.timezone) : ""}
                        empty="Not set. Invoice numbers use India time."
                    />
                </Row>
                {/* No web address row: the Web address card under this one
                    shows it whole and changes it (DEC-069, L4). */}
                <Row label="Trading since">
                    <span className="flex flex-wrap items-baseline gap-2">
                        <Saved text={tradingSince} empty="No orders yet" mono />
                        <Locked>From your first order</Locked>
                    </span>
                </Row>
            </BusinessRows>
        );
    }

    if (tab === "contact") {
        return (
            <BusinessRows
                title={DETAIL_TABS.contact.title}
                lead={`How ${words.people} reach you`}
            >
                <Row
                    id={BUSINESS_ROW_ID.contactEmail}
                    label="Contact email"
                    action={editOrAdd(
                        "contactEmail",
                        Boolean(saved.contactEmail),
                        "contact email",
                        "Add email",
                    )}
                >
                    <Saved text={saved.contactEmail ?? ""} />
                </Row>
                <Row
                    id={BUSINESS_ROW_ID.phone}
                    label="Phone on your website"
                    action={editOrAdd(
                        "phone",
                        saved.phone !== "",
                        "phone",
                        "Add phone",
                    )}
                >
                    <Saved
                        text={saved.phone}
                        empty="None. Your website shows no Call button."
                        mono
                    />
                </Row>
                <Row
                    id={BUSINESS_ROW_ID.website}
                    label="Website"
                    action={editOrAdd(
                        "website",
                        Boolean(saved.website),
                        "website",
                        "Add website",
                    )}
                >
                    <Saved
                        text={saved.website ?? ""}
                        empty="None outside Saroh"
                    />
                </Row>
            </BusinessRows>
        );
    }

    if (tab === "tax") {
        return (
            <BusinessTaxRows
                settings={settings}
                canEdit={canEdit}
                sheets={sheets}
            />
        );
    }

    const address = addressText(saved);
    return (
        <BusinessRows
            title={DETAIL_TABS.address.title}
            lead={DETAIL_TABS.address.lead}
            note="Printed under your legal name on every invoice and receipt."
        >
            <Row
                id={BUSINESS_ROW_ID.address}
                label="Registered address"
                action={editOrAdd(
                    "address",
                    address !== "",
                    "registered address",
                    "Add address",
                )}
            >
                {address ? (
                    <span className="block whitespace-pre-line [overflow-wrap:anywhere]">
                        {address}
                    </span>
                ) : (
                    <Absent>No registered address yet</Absent>
                )}
                {saved.country ? (
                    <Follows>{countryName(saved.country)}</Follows>
                ) : null}
            </Row>
        </BusinessRows>
    );
}
