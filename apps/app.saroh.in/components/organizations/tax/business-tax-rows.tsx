import {
    gstStateOf,
    nextNumberOf,
    valuesOf,
} from "@/components/organizations/business-settings/business-form";
import {
    BusinessRows,
    Follows,
    Locked,
    rowActions,
    Saved,
} from "@/components/organizations/business-settings/business-row-parts";
import { Row } from "@/components/sites/settings-rows";
import { PRICE_MODE_ROW, PRICE_MODE_SAYS } from "@/lib/gst/price-mode";
import { rateOption } from "@/lib/invoices/gst";
import { formatOf, RESTART_LABEL } from "@/lib/invoices/invoice-number";
import { lookWords } from "@/lib/invoices/paper-look";
import { BUSINESS_ROW_ID } from "@/lib/organizations/business-rows";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";

import type { BusinessSheets } from "@/components/organizations/business-settings/use-business-sheets";
import { savedPaper } from "@/components/organizations/invoice-paper/invoice-paper-sheet";
import { TextLink } from "@saroh/ui/text-link";

export const TAX_TAB = {
    title: "Tax and invoices",
    lead: "What every invoice carries",
} as const;

/**
 * Tax and invoices, read first: whether the business is GST-registered,
 * its GSTIN (or another tax ID), how its invoices are numbered and, for a
 * registered business, the GST delivery is charged and whether its prices
 * include GST or have it added (12 Oct 2026; a business that isn't
 * registered has no such row). The state and the
 * financial year are facts nobody sets here, and say where they come from.
 */
export function BusinessTaxRows({
    settings,
    canEdit,
    sheets,
}: {
    settings: OrganizationSettings;
    canEdit: boolean;
    sheets: BusinessSheets;
}) {
    const saved = valuesOf(settings);
    const { edit, editOrAdd } = rowActions(canEdit, sheets);
    const registered = saved.gstRegistered;
    const state = gstStateOf(saved);
    const taxId = saved.taxId ?? "";
    return (
        <BusinessRows
            title={TAX_TAB.title}
            lead={TAX_TAB.lead}
            // The invoices themselves, from here too: a site for my
            // work has no Invoices row in the rail until Payments is on
            // (UX-074).
            note={
                <>
                    The invoices you send, and their numbers, are in{" "}
                    <TextLink href="/billing/invoices">Invoices</TextLink>.
                </>
            }
        >
            <Row
                id={BUSINESS_ROW_ID.gst}
                label="GST"
                action={edit("gst", "Change", "Change GST registration")}
            >
                <span className="block">
                    {registered ? "Registered" : "Not registered"}
                </span>
                <Follows>
                    {registered
                        ? "Orders and invoices are tax invoices with your GSTIN."
                        : "Orders and invoices are receipts, with no GST on them."}
                </Follows>
            </Row>
            <Row
                id={BUSINESS_ROW_ID.taxId}
                label={registered ? "GSTIN" : "Tax ID"}
                action={
                    registered
                        ? editOrAdd("taxId", taxId !== "", "GSTIN", "Add GSTIN")
                        : editOrAdd(
                              "taxId",
                              taxId !== "",
                              "tax ID",
                              "Add tax ID",
                          )
                }
            >
                <Saved
                    text={taxId}
                    empty={registered ? "Not set" : "None"}
                    mono
                />
            </Row>
            {registered ? (
                <Row label="State">
                    <Saved
                        text={
                            state.name
                                ? `${state.name}${state.fromGstin ? " · from the GSTIN" : ""}`
                                : ""
                        }
                        empty="Comes from your GSTIN"
                    />
                </Row>
            ) : null}
            <Row label="Financial year">
                <span className="flex flex-wrap items-baseline gap-2">
                    {/* India's financial year, which invoices are
                        numbered by. GST law fixes it for every
                        business, so it is said rather than offered. */}
                    <span>April to March</span>
                    <Locked>Set by GST law</Locked>
                </span>
            </Row>
            <Row
                id={BUSINESS_ROW_ID.numbers}
                label="Invoice numbers"
                action={edit("numbers", "Edit", "Edit invoice numbers")}
            >
                <Saved text={nextNumberOf(saved, settings)} mono />
                <Follows>
                    Restarts: {RESTART_LABEL[formatOf(saved).restart]}
                </Follows>
            </Row>
            <Row
                id={BUSINESS_ROW_ID.paper}
                label="Invoice style"
                action={edit("paper", "Edit", "Edit invoice style")}
            >
                <Saved text={lookWords(savedPaper(settings))} />
                <Follows>
                    New invoices start in it. An invoice can choose its own on
                    the paper.
                </Follows>
            </Row>
            {registered ? (
                <Row
                    id={BUSINESS_ROW_ID.delivery}
                    label="GST on delivery"
                    action={edit("delivery", "Edit", "Edit GST on delivery")}
                >
                    <span className="block tabular-nums">
                        {rateOption(saved.deliveryRate) || "18"}%
                    </span>
                    <Follows>
                        {saved.deliverySac ? (
                            <>
                                Delivery SAC{" "}
                                <span className="font-mono">
                                    {saved.deliverySac}
                                </span>
                            </>
                        ) : (
                            "No delivery SAC yet"
                        )}
                    </Follows>
                </Row>
            ) : null}
            {registered ? (
                <Row
                    id={BUSINESS_ROW_ID.priceMode}
                    label={PRICE_MODE_ROW}
                    action={edit(
                        "priceMode",
                        "Edit",
                        "Edit GST on your prices",
                    )}
                >
                    <span className="block">
                        {PRICE_MODE_SAYS[saved.priceMode]}
                    </span>
                    <Follows>
                        For your services and products. One of them can be set
                        differently where you edit it.
                    </Follows>
                </Row>
            ) : null}
        </BusinessRows>
    );
}
