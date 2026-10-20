"use client";

import type { PaperStyle } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Palette } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import type { UseFieldArrayReturn, UseFormReturn } from "react-hook-form";
import { useWatch } from "react-hook-form";

import { HeaderOverlay } from "@/components/bookings/calendar/header/header-overlay";
import { usePhone } from "@/components/bookings/calendar/header/use-phone";
import { BusinessLogoSheet } from "@/components/organizations/business-logo-sheet";
import { PayInstructionsSheet } from "@/components/organizations/pay-instructions-sheet";
import { runAction } from "@/lib/api/run-action";
import type { GstPriceMode } from "@/lib/gst/price-mode";
import type {
    InvoiceFormBusiness,
    InvoiceFormValues,
} from "@/lib/invoices/new-invoice";
import { EMPTY_LINE, isGoodLine, issueLine } from "@/lib/invoices/new-invoice";
import type { PickRow } from "@/lib/invoices/new-invoice-lines";
import { lineOfProduct } from "@/lib/invoices/new-invoice-lines";
import { hasOwnLook, lookOf } from "@/lib/invoices/paper-look";
import { saveOrganizationSettingsInPlace } from "@/lib/organizations/settings-actions";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";

import { CustomerBlock } from "../new-invoice/customer-block";
import { DueStrip } from "../new-invoice/due-strip";
import { placeLine, takeLine } from "../new-invoice/line-ops";
import type { PaperTarget } from "../new-invoice/paper-preview";
import { PaperPreview } from "../new-invoice/paper-preview";
import type { PaperProps } from "../new-invoice/paper-props";
import { AddLine } from "./add-line";
import {
    DoneFoot,
    FromElsewhere,
    LineEditor,
    LineFoot,
    PartOverlay,
    partId,
    samePart,
} from "./part-popover";
import { SeeAsCustomer } from "./see-as-customer";
import { StylePanel } from "./style-panel";

type CustomerProps = Omit<
    ComponentProps<typeof CustomerBlock>,
    "form" | "bare" | "disabled"
>;

const MARK = { shouldDirty: true } as const;

/**
 * New invoice "on the paper" (INVNewEdit and INVNewEditPhone, U15 #1127):
 * the same draft as the form, written by pressing the paper itself. Each
 * part opens its editor in place (a popover on the desk, a sheet on a
 * phone): who it's billed to, a line, "Add a line", when it's due and How
 * to pay us. The seller and the number say where they come from. Every
 * edit is the form's own field, so the totals and tax follow it and the
 * draft saves as it always does (`use-invoice-draft`).
 *
 * Beside it, the style rail (`StylePanel`): Classic, Band or Compact and
 * the colour, saved on the draft, and the business's default for an owner
 * or admin. The GST particulars a tax invoice must carry are labelled on
 * the paper and none of them has a way off, whatever the style.
 */
export function PaperEditor({
    form,
    lines,
    paper,
    business,
    businessName,
    registered,
    currency,
    zone,
    now,
    draftDueAt,
    customer,
    canPickProducts,
    priceMode,
    disabled,
    canSetDefault,
    onSettings,
    flush,
}: {
    form: UseFormReturn<InvoiceFormValues>;
    lines: UseFieldArrayReturn<InvoiceFormValues, "lines">;
    paper: PaperProps;
    business: InvoiceFormBusiness | null;
    businessName: string;
    registered: boolean;
    currency: string;
    zone: string;
    now: Date;
    draftDueAt: string | null;
    customer: CustomerProps;
    canPickProducts: boolean;
    priceMode: GstPriceMode | null;
    disabled: boolean;
    /** `org:update`: the business's default, its logo and How to pay us. */
    canSetDefault: boolean;
    /** The business's settings as a save here answered. */
    onSettings: (next: OrganizationSettings) => void;
    /** Saves what is typed now (`use-invoice-draft`), before a settings save. */
    flush: () => Promise<boolean>;
}) {
    const phone = usePhone();
    const [editing, setEditing] = useState<PaperTarget | null>(null);
    const [styleOpen, setStyleOpen] = useState(false);
    const [sheet, setSheet] = useState<{
        which: "logo" | "pay";
        open: boolean;
        opened: number;
    } | null>(null);
    const [savingDefault, setSavingDefault] = useState(false);
    const values = useWatch({ control: form.control }) as InvoiceFormValues;
    const fallback = business?.paper ?? {
        style: paper.style,
        colour: paper.colour,
    };
    const look = lookOf(values, fallback);
    const own = hasOwnLook(values);

    const close = () => setEditing(null);
    const openSheet = (which: "logo" | "pay") => {
        setEditing(null);
        setStyleOpen(false);
        setSheet((s) => ({ which, open: true, opened: (s?.opened ?? 0) + 1 }));
    };

    // Lines being written: on the paper so they can be finished.
    const unfinished = values.lines
        .map((l, index) => ({ l, index }))
        .filter(
            ({ l }) =>
                !isGoodLine(l) &&
                (l.description.trim() !== "" || l.unitPrice.trim() !== ""),
        )
        .map(({ l, index }) => ({ index, description: l.description.trim() }));

    function addProduct(row: PickRow) {
        placeLine(form, lines, lineOfProduct(row, { registered, priceMode }));
    }
    function addTyped(description: string) {
        const at = placeLine(form, lines, { ...EMPTY_LINE, description });
        // Its price and GST next, in its own editor.
        setTimeout(() => setEditing({ part: "line", index: at }), 0);
    }

    function setStyle(style: PaperStyle) {
        form.setValue("paperStyle", style, MARK);
        // The colour goes with it, so the draft is one look of its own.
        if (!values.paperColour) {
            form.setValue("paperColour", look.colour ?? "", MARK);
        }
    }
    function setColour(hex: string) {
        form.setValue("paperColour", hex, MARK);
        if (!values.paperStyle) form.setValue("paperStyle", look.style, MARK);
    }
    function followDefault() {
        form.setValue("paperStyle", "", MARK);
        form.setValue("paperColour", "", MARK);
    }
    /**
     * A save of the business's settings from here never redraws the page
     * (review #15): on a new invoice that has its own address by now, a
     * revalidation threw the editor away, with the Style sheet and the last
     * 800 ms of typing. So the draft is saved first, and the settings save
     * is the one that revalidates nothing; the editor takes its answer.
     */
    async function makeDefault() {
        const paperLook = { style: look.style, colour: look.colour ?? "" };
        const res = await runAction(
            async () => {
                await flush();
                return saveOrganizationSettingsInPlace({
                    invoicePaper: paperLook,
                });
            },
            { setBusy: setSavingDefault },
        );
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        onSettings(res.data);
        // It is the default now: the draft follows it, as new ones do.
        followDefault();
        showSuccess("Saved as your default. New invoices start in this look.");
    }

    const editorOf = (
        target: PaperTarget,
    ): { title: string; body: () => ReactNode; footer?: ReactNode } => {
        switch (target.part) {
            case "seller":
                return {
                    title: "Your business",
                    body: () => (
                        <FromElsewhere>
                            <p>
                                Your name, address and GSTIN come from Settings
                                › Business, the same on every invoice.
                            </p>
                            <p className="text-muted-foreground">
                                A tax invoice always carries them (GST Rule 46):
                                no style leaves them off.
                            </p>
                        </FromElsewhere>
                    ),
                };
            case "number":
                return {
                    title: "The number",
                    body: () => (
                        <FromElsewhere>
                            <p>{issueLine(business?.nextNumber ?? null)}</p>
                            <p className="text-muted-foreground">
                                It is the next in your series, so it can't be
                                typed or taken off.
                            </p>
                        </FromElsewhere>
                    ),
                };
            case "buyer":
                return {
                    title: "Billed to",
                    body: () => (
                        <CustomerBlock
                            {...customer}
                            form={form}
                            disabled={disabled}
                            bare
                        />
                    ),
                    footer: <DoneFoot onDone={close} />,
                };
            case "due":
                return {
                    title: "Due",
                    body: () => (
                        <DueStrip
                            value={values.due}
                            onChange={(due) => form.setValue("due", due, MARK)}
                            draftDueAt={draftDueAt}
                            zone={zone}
                            now={now}
                        />
                    ),
                    footer: <DoneFoot onDone={close} />,
                };
            case "notes":
                return {
                    title: "How to pay us",
                    body: () => (
                        <FromElsewhere>
                            <p>
                                Printed on every unpaid invoice: your UPI ID,
                                bank details and a note, set once for the
                                business.
                            </p>
                            {canSetDefault && business?.pay !== undefined ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    id="paper-change-pay"
                                    className="w-fit"
                                    onClick={() => openSheet("pay")}
                                >
                                    Change how to pay us
                                </Button>
                            ) : (
                                <p className="text-muted-foreground">
                                    An owner or admin changes it in Settings ›
                                    Business.
                                </p>
                            )}
                        </FromElsewhere>
                    ),
                };
            case "line":
                return {
                    title: `Line ${target.index + 1}`,
                    body: () => (
                        <LineEditor
                            form={form}
                            index={target.index}
                            currency={currency}
                            registered={registered}
                        />
                    ),
                    footer: (
                        <LineFoot
                            onRemove={() => {
                                close();
                                takeLine(form, lines, target.index);
                            }}
                            onDone={close}
                        />
                    ),
                };
        }
    };

    const part = (target: PaperTarget, label: string, node: ReactNode) => {
        const editor = editorOf(target);
        return (
            <PartOverlay
                target={target}
                label={label}
                title={editor.title}
                open={samePart(editing, target)}
                onOpenChange={(o) =>
                    setEditing((now) =>
                        o ? target : samePart(now, target) ? null : now,
                    )
                }
                footer={editor.footer}
                editor={editor.body}
            >
                {node}
            </PartOverlay>
        );
    };

    const panel = (
        <StylePanel
            look={look}
            own={own}
            fallback={fallback}
            onStyle={setStyle}
            onColour={setColour}
            onUseDefault={followDefault}
            canSetDefault={canSetDefault}
            onMakeDefault={() => void makeDefault()}
            savingDefault={savingDefault}
            logo={{
                url: paper.seller.logo,
                initials: initialsOf(businessName),
            }}
            onChangeLogo={canSetDefault ? () => openSheet("logo") : undefined}
        />
    );

    return (
        <div className="grid items-start gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_260px]">
            <div className="min-w-0 max-w-[820px]">
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                    <p className="flex-1 text-[13px] text-muted-foreground">
                        {phone
                            ? "Tap any part to change it."
                            : "Click any part of the paper to change it."}
                    </p>
                    {phone ? (
                        <>
                            <HeaderOverlay
                                open={styleOpen}
                                onOpenChange={setStyleOpen}
                                title="Style"
                                width={320}
                                trigger={
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                    >
                                        <Palette
                                            aria-hidden
                                            className="size-4"
                                        />
                                        Style
                                    </Button>
                                }
                                footer={
                                    <Button
                                        type="button"
                                        onClick={() => setStyleOpen(false)}
                                    >
                                        Done
                                    </Button>
                                }
                            >
                                {panel}
                            </HeaderOverlay>
                            <SeeAsCustomer paper={paper} />
                        </>
                    ) : null}
                </div>
                <PaperPreview
                    {...paper}
                    editing={{
                        part,
                        unfinished,
                        addLine: (
                            <AddLine
                                currency={currency}
                                registered={registered}
                                canPickProducts={canPickProducts}
                                disabled={disabled}
                                onProduct={addProduct}
                                onTyped={addTyped}
                            />
                        ),
                    }}
                />
            </div>
            {phone ? null : (
                <aside
                    aria-label="Style"
                    className="min-w-0 rounded-[12px] border border-border bg-card p-4 min-[1100px]:sticky min-[1100px]:top-3"
                >
                    {panel}
                </aside>
            )}

            {sheet?.which === "logo" ? (
                <BusinessLogoSheet
                    key={sheet.opened}
                    settings={{
                        name: businessName,
                        logo: business?.logoFile ?? null,
                    }}
                    open={sheet.open}
                    returnTo="paper-change-logo"
                    inPlace
                    onClose={() =>
                        setSheet((s) => (s ? { ...s, open: false } : s))
                    }
                    onSaved={(next, said) => {
                        onSettings(next);
                        showSuccess(said);
                    }}
                />
            ) : sheet?.which === "pay" ? (
                <PayInstructionsSheet
                    key={sheet.opened}
                    saved={business?.pay}
                    businessName={businessName}
                    open={sheet.open}
                    returnTo={partId({ part: "notes" })}
                    inPlace
                    onClose={() =>
                        setSheet((s) => (s ? { ...s, open: false } : s))
                    }
                    onSaved={(next) => {
                        onSettings(next);
                        showSuccess("How to pay us saved.");
                    }}
                />
            ) : null}
        </div>
    );
}

/** "Rye & Co." → "R&C": the logo's stand-in. */
function initialsOf(name: string): string {
    return (
        name
            .split(/\s+/)
            .filter((w) => /[A-Za-z0-9&]/.test(w))
            .slice(0, 3)
            .map((w) => w[0])
            .join("")
            .toUpperCase() || "·"
    );
}
