import { paperColourOf, paperStyleOf } from "@saroh/block-contract";

import { businessZone } from "@/lib/format/business-zone";
import { businessModeOf } from "@/lib/gst/price-mode";
import { printedAddress } from "@/lib/organizations/registered-address";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";

import type { InvoiceFormBusiness } from "./new-invoice";
import { nextNumberOf } from "./new-invoice";

/**
 * What New invoice (U14 #1126) needs of the business, from the settings
 * read its page already makes: the seller as the paper prints it, the GST
 * state the place of supply falls back on, how its prices carry GST, its
 * zone, its invoices' look (U6) and the number issuing will give. Null
 * when the settings couldn't be read (a role without them): the form then
 * draws the paper with the name alone, as the paper does.
 */
export function newInvoiceBusiness(
    settings: OrganizationSettings | null,
    now: Date = new Date(),
): InvoiceFormBusiness | null {
    if (!settings) return null;
    const registered = settings.tax?.registered ?? false;
    const state = settings.tax?.state ?? null;
    const zone = businessZone({ timeZone: settings.profile?.timezone });
    return {
        seller: {
            name: settings.name,
            address: printedAddress(settings.registeredAddress),
            gstin: registered ? (settings.profile?.taxId ?? null) : null,
            state: state
                ? `${settings.tax?.stateName ?? "State"} (${state})`
                : null,
            logo: settings.logo?.url ?? null,
        },
        state,
        priceMode: registered ? businessModeOf(settings.tax?.priceMode) : null,
        zone,
        paper: {
            style: paperStyleOf(settings.invoicePaper?.style),
            colour: paperColourOf(settings.invoicePaper?.colour),
        },
        nextNumber: nextNumberOf(settings.tax, zone, now),
    };
}
