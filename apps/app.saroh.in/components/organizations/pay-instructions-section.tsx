"use client";

import { cn } from "@saroh/ui/lib/utils";

import {
    BusinessRows,
    EditRow,
} from "@/components/organizations/business-row-parts";
import { PayInstructionsSheet } from "@/components/organizations/pay-instructions-sheet";
import { PayPreview } from "@/components/organizations/pay-preview";
import type { OfferUndo } from "@/components/organizations/use-settings-undo";
import { Absent, Row } from "@/components/sites/settings-rows";
import { BUSINESS_ROW_ID } from "@/lib/organizations/business-rows";
import type { PayInstructionsSettings } from "@/lib/organizations/pay-instructions";
import {
    accountLabel,
    payPreviewOf,
    payValuesOf,
} from "@/lib/organizations/pay-instructions";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";

import type { BusinessSheets } from "./use-business-sheets";

export const PAY_SECTION = {
    title: "How to pay us",
    lead: "UPI and bank details for customers who pay you directly",
} as const;

const NOTE =
    "Shown to customers on invoices and unpaid orders, so they can pay you by UPI or bank transfer. Only someone looking at their own invoice, order or booking sees them.";

/** The three rows; each opens the one sheet and takes the keyboard back. */
const ROW_EDIT = {
    upi: `${BUSINESS_ROW_ID.pay}-edit`,
    bank: "business-pay-bank-edit",
    note: "business-pay-note-edit",
} as const;

/**
 * Business → How to pay us (R32), read first (owner, 10 Oct): the UPI ID,
 * bank details and short note a customer sees on their own unpaid invoice,
 * order or desk booking, as three rows, with what the customer sees beside
 * them. Any row's Edit opens the one sheet that holds all three
 * (`pay-instructions-sheet.tsx`): a customer reads them as one card.
 */
export function PayInstructionsSection({
    saved,
    businessName,
    canEdit,
    hidden,
    sheets,
    onSaved,
    offerUndo,
}: {
    /** The settings read's `payInstructions`; absent from an older API. */
    saved: PayInstructionsSettings | undefined;
    businessName: string;
    canEdit: boolean;
    /** Another tab is showing. */
    hidden: boolean;
    sheets: BusinessSheets;
    /** The settings as the save answered, for the rest of the screen. */
    onSaved: (next: OrganizationSettings) => void;
    offerUndo: OfferUndo;
}) {
    const bank =
        saved?.bankAccountNumber && saved.bankIfsc
            ? [
                  saved.bankAccountName,
                  accountLabel(saved.bankAccountNumber),
                  saved.bankIfsc,
                  saved.bankName,
              ]
                  .filter(Boolean)
                  .join("\n")
            : "";
    const editing = sheets.editing?.which === "pay" ? sheets.editing : null;

    const edit = (id: string, set: boolean, what: string, add: string) =>
        canEdit ? (
            <EditRow
                sheet="pay"
                sheets={sheets}
                id={id}
                label={set ? "Edit" : add}
                name={set ? `Edit ${what}` : undefined}
            />
        ) : null;

    return (
        <div
            className={cn(
                "flex min-w-0 flex-[1_1_100%] flex-wrap items-start gap-5",
                hidden && "hidden",
            )}
        >
            <div
                id="business-pay-panel"
                role="tabpanel"
                aria-labelledby="business-tab-pay"
                className="grid min-w-0 flex-[1_1_460px] gap-4"
            >
                <BusinessRows
                    title={PAY_SECTION.title}
                    lead={PAY_SECTION.lead}
                    note={NOTE}
                >
                    <Row
                        id={BUSINESS_ROW_ID.pay}
                        label="UPI ID"
                        action={edit(
                            ROW_EDIT.upi,
                            Boolean(saved?.upiId),
                            "UPI ID",
                            "Add UPI ID",
                        )}
                    >
                        {saved?.upiId ? (
                            <span className="block font-mono [overflow-wrap:anywhere]">
                                {saved.upiId}
                            </span>
                        ) : (
                            <Absent>Not set</Absent>
                        )}
                    </Row>
                    <Row
                        label="Bank transfer"
                        action={edit(
                            ROW_EDIT.bank,
                            bank !== "",
                            "bank details",
                            "Add bank details",
                        )}
                    >
                        {bank ? (
                            <span className="block whitespace-pre-line [overflow-wrap:anywhere]">
                                {bank}
                            </span>
                        ) : (
                            <Absent>Not set</Absent>
                        )}
                    </Row>
                    <Row
                        label="Note"
                        action={edit(
                            ROW_EDIT.note,
                            Boolean(saved?.note),
                            "note",
                            "Add note",
                        )}
                    >
                        {saved?.note ? (
                            <span className="block [overflow-wrap:anywhere]">
                                {saved.note}
                            </span>
                        ) : (
                            <Absent>No note</Absent>
                        )}
                    </Row>
                </BusinessRows>
            </div>
            {/* Its own preview, in place of the invoice's: what is saved. */}
            <PayPreview
                live={false}
                businessName={businessName}
                preview={payPreviewOf(payValuesOf(saved))}
            />

            {/* The open sheet, a fresh draft each time it opens. */}
            {editing && canEdit ? (
                <PayInstructionsSheet
                    key={editing.opened}
                    saved={saved}
                    businessName={businessName}
                    open={editing.open}
                    returnTo={editing.returnTo}
                    onClose={sheets.close}
                    onSaved={(next) => {
                        offerUndo("How to pay us saved", null);
                        onSaved(next);
                    }}
                />
            ) : null}
        </div>
    );
}
