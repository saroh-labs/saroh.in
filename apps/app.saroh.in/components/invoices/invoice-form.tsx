"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PageHeader } from "@saroh/ui/page-header";
import { Segmented } from "@saroh/ui/segmented";
import { showError } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import type { BaseSyntheticEvent, ReactNode } from "react";
import { useId, useState } from "react";
import type { FieldErrors } from "react-hook-form";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

import type { AddedContact } from "@/components/contacts/add-contact-dialog";
import { useBusinessDetailsStep } from "@/components/organizations/business-details/use-business-details-step";
import {
    lostChanges,
    lostNew,
    useLeaveGuard,
} from "@/components/shared/use-leave-guard";
import { formatMoney } from "@/lib/format/money";
import { submitOnModEnter } from "@/lib/hooks/keyboard-save";
import { PAGE_FORM, toFirstError, toFirstErrorIn } from "@/lib/hooks/page-form";
import { useTabParam } from "@/lib/hooks/use-tab-param";
import { rateOption } from "@/lib/invoices/gst";
import { LINE_RATE_NEEDED, linesMissingRate } from "@/lib/invoices/line-rates";
import type {
    InvoiceFormBusiness,
    InvoiceFormValues,
} from "@/lib/invoices/new-invoice";
import {
    EMPTY_LINE,
    invoiceFormSchema,
    isGoodLine,
} from "@/lib/invoices/new-invoice";
import { newInvoiceBusiness } from "@/lib/invoices/new-invoice-business";
import { previewSums } from "@/lib/invoices/new-invoice-lines";
import type { Invoice } from "@/lib/invoices/service";
import { ISSUE_AND_SHARE, ISSUE_IT } from "@/lib/invoices/words";
import type { DetailsOnFile } from "@/lib/organizations/business-details";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";

import { CustomerBlock, NoContactsYet } from "./new-invoice/customer-block";
import { DueStrip } from "./new-invoice/due-strip";
import { finishInvoice } from "./new-invoice/finish";
import {
    FormButtons,
    PhoneFoot,
    SavePill,
    SeeItToggle,
} from "./new-invoice/form-parts";
import { LinesTable } from "./new-invoice/lines-table";
import { paperPropsOf } from "./new-invoice/paper-props";
import { PreviewAside } from "./new-invoice/preview-aside";
import { useInvoiceDraft } from "./new-invoice/use-invoice-draft";
import { PaperEditor } from "./paper-editor/paper-editor";
import { SeeAsCustomer } from "./paper-editor/see-as-customer";

/** How it is written: the form, or on the paper (U15), in `?mode=`. */
const MODES = ["form", "paper"] as const;
type Mode = (typeof MODES)[number];

/**
 * New invoice (A), INVNewA and INVNewAPhone (DEC-173 U14 #1126): a
 * hand-written invoice, new or a draft being changed, for trade and one-off
 * work. Orders and subscriptions make their own.
 *
 * The left column is who it's billed to (picked or added in place, and on a
 * GST-registered business their GSTIN, state and address, with the place
 * of supply worked out), what it's for (the lines, typed or picked from the
 * products) and when it falls due. The right is "How it will look": the
 * paper at a reduced size, in the style and colour it will go out in,
 * changing as it is typed. On a phone it is one column, the paper behind
 * "See how it will look", and the buttons at the foot.
 *
 * "On the paper" (U15 #1127, `?mode=paper`) is the same draft written by
 * pressing the paper itself, with the style rail beside it
 * (`paper-editor/`). Switching keeps everything typed: one form holds both.
 *
 * It saves as it is typed (`use-invoice-draft.ts`). "Save draft" is the
 * form's one submit, so Enter keeps it a draft; issuing numbers it and
 * locks its lines, so it is a press of its own ("Issue and share", which
 * copies its payment link, or "Issue it"). The GST-rate step and the
 * business-details step stand before issuing, as they did.
 */
export function InvoiceForm({
    contacts: listed,
    defaultCurrency,
    draft,
    initialContactId,
    registered,
    businessName,
    providerConnected,
    detailsOnFile = null,
    business = null,
    canPickProducts = false,
    canSetDefault = false,
    header,
}: {
    contacts: { id: string; name: string; email: string }[];
    defaultCurrency: string;
    /** The draft being changed; absent for a new invoice. */
    draft?: Invoice;
    /** Who a new invoice is for, already chosen — from a contact's page. */
    initialContactId?: string;
    /** A GST-registered business: lines carry a rate and HSN/SAC. */
    registered: boolean;
    businessName: string;
    /** A payment link can be made (Payments on, a provider connected), so issuing makes one. */
    providerConnected: boolean;
    /**
     * The business details on file, read with the page: Issue asks for any
     * that are missing before it saves anything (#838).
     */
    detailsOnFile?: DetailsOnFile | null;
    /** Null when this role can't read the business's settings. */
    business?: InvoiceFormBusiness | null;
    /** The business has products this person can read. */
    canPickProducts?: boolean;
    /**
     * `org:update` (Owner, Admin): may make a look the business's default,
     * and change its logo and How to pay us from the paper.
     */
    canSetDefault?: boolean;
    /** The page's breadcrumb and title. */
    header?: { breadcrumb: ReactNode[]; title: string };
}) {
    const router = useRouter();
    const details = useBusinessDetailsStep({
        then: "issue it",
        continueLabel: "Save and issue",
        onFile: detailsOnFile,
        // Saved here, the editor stays drawn (review #15).
        inPlace: true,
    });
    const ids = { preview: useId(), why: useId() };
    // Which button is working, for its label. Never what a submit does:
    // Enter in a field is the form's own submit, and that saves the draft.
    const [intent, setIntent] = useState<"issue" | "draft" | null>(null);
    // Someone added from Who (UX-047) joins the list here, chosen.
    const [added, setAdded] = useState<AddedContact[]>([]);
    const contacts = [...added, ...listed];
    const hasBuyerGst = Boolean(
        draft?.billToGst?.gstin ??
        draft?.billToGst?.state ??
        draft?.billToGst?.address,
    );
    const [buyerOpen, setBuyerOpen] = useState(hasBuyerGst);
    // The phone's paper, behind "See how it will look".
    const [seeIt, setSeeIt] = useState(false);
    const [mode, setMode] = useTabParam<Mode>("mode", MODES, "form");
    // The business as the page read it, and as a save on the paper
    // answered (its default look, logo, How to pay us).
    const [biz, setBiz] = useState(business);
    const onSettings = (next: OrganizationSettings) =>
        setBiz(newInvoiceBusiness(next));
    const currency = draft?.currency ?? defaultCurrency;
    const zone = biz?.zone ?? "Asia/Kolkata";
    const [now] = useState(() => new Date());

    const form = useForm<InvoiceFormValues>({
        resolver: zodResolver(invoiceFormSchema),
        ...PAGE_FORM,
        defaultValues: {
            contactId: draft?.contact?.id ?? initialContactId ?? "",
            due: draft?.dueAt ? "kept" : 14,
            billToGstin: draft?.billToGst?.gstin ?? "",
            billToState: draft?.billToGst?.state ?? "",
            billToAddress: draft?.billToGst?.address ?? "",
            lines: draft?.lines?.length
                ? draft.lines.map((l) => ({
                      description: l.description,
                      quantity: l.quantity,
                      unitPrice: l.unitPrice,
                      gstRate: rateOption(l.gst?.rate),
                      hsnSac: l.gst?.hsnSac ?? "",
                  }))
                : [EMPTY_LINE],
            // Its own look, or "" to follow the business's (U15).
            paperStyle: draft?.paperChoice?.style ?? "",
            paperColour: draft?.paperChoice?.colour ?? "",
        },
    });
    const lines = useFieldArray({ control: form.control, name: "lines" });
    const saving = useInvoiceDraft({
        form,
        draft,
        registered,
        currency,
        zone,
    });
    const { isSubmitting } = form.formState;
    const values = useWatch({ control: form.control }) as InvoiceFormValues;
    const watchedLines = values.lines;

    const noLine = !watchedLines.some(isGoodLine);
    const typed = watchedLines.some((l) => l.description || l.unitPrice);
    const withLink = providerConnected;
    const sums = previewSums(
        {
            lines: watchedLines,
            billToGstin: values.billToGstin,
            billToState: values.billToState,
        },
        { registered, businessState: biz?.state ?? null },
    );
    const buyerName =
        contacts.find((c) => c.id === values.contactId)?.name ??
        draft?.contact?.name ??
        null;
    const paper = paperPropsOf({
        values,
        sums,
        business: biz,
        businessName,
        buyerName,
        registered,
        currency,
        zone,
        draft,
        now,
    });
    const busy = isSubmitting || intent !== null;

    /** The draft as the server now has it, or null when that couldn't be. */
    async function kept(): Promise<Invoice | null> {
        const res = await saving.keep();
        if (!res.ok) {
            showError(res.error);
            return null;
        }
        return res.invoice;
    }

    async function onSubmit(want: "issue" | "draft") {
        // A tax invoice's lines each need their rate before it is issued
        // (12 Oct 2026): said on the line, before anything is saved. A
        // draft is kept without them.
        const unrated =
            want === "issue"
                ? linesMissingRate(form.getValues("lines"), registered)
                : [];
        if (unrated.length > 0) {
            for (const place of unrated) {
                form.setError(`lines.${place}.gstRate`, {
                    type: "gst-rate",
                    message: LINE_RATE_NEEDED,
                });
            }
            // The page holds one form: the first line marked is its own.
            toFirstErrorIn(null);
            return;
        }
        setIntent(want);
        try {
            // Missing details are asked for at once, before the save (#838):
            // asked after it, the sheet waited on a save, a refusal and a
            // read. Closed without saving, the draft is still kept.
            // What was typed in the last moments is saved first, so no
            // save the step makes can lose it (review #15).
            if (want === "issue") await saving.flush();
            const detailsReady =
                want === "issue" ? await details.ensure() : true;
            const saved = await kept();
            if (!saved) return;
            guard.release();
            await finishInvoice({
                want,
                saved,
                detailsReady,
                run: details.run,
                withLink,
                push: (to) => router.push(to),
            });
        } finally {
            setIntent(null);
        }
    }

    function onInvalid(
        errs: FieldErrors<InvoiceFormValues>,
        event?: BaseSyntheticEvent,
    ) {
        if (errs.billToGstin || errs.billToState) setBuyerOpen(true);
        // The buyer's fields open first, so the keyboard can land on one.
        toFirstError(errs, event);
        if (errs.lines?.root?.message ?? errs.lines?.message) {
            showError(String(errs.lines.root?.message ?? errs.lines.message));
        }
    }

    const press = (want: "issue" | "draft") =>
        form.handleSubmit(() => onSubmit(want), onInvalid);

    // Saved as it is typed: a way out saves first, and asks only when that
    // save can't go (a field that's wrong, or Saroh out of reach).
    const guard = useLeaveGuard({
        dirty: !saving.settled,
        lost: saving.id ? lostChanges("this draft") : lostNew("invoice"),
        flush: saving.flush,
        save: async () => {
            let ok = false;
            await form.handleSubmit(async () => {
                ok = (await kept()) !== null;
            }, onInvalid)();
            return ok;
        },
    });

    function onContactAdded(c: AddedContact) {
        setAdded((a) => [c, ...a]);
        form.setValue("contactId", c.id, {
            shouldValidate: true,
            shouldDirty: true,
        });
    }

    const heading = (
        badge?: ReactNode,
        actions?: ReactNode,
        meta?: ReactNode,
    ) =>
        header ? (
            <PageHeader
                className="mb-4"
                breadcrumb={header.breadcrumb}
                title={header.title}
                // "New invoice" or "Edit the draft": fixed words.
                holdsData={false}
                badge={badge}
                meta={meta}
                actions={actions}
            />
        ) : badge || actions || meta ? (
            <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
                {badge}
                {meta}
                {actions}
            </div>
        ) : null;

    if (contacts.length === 0 && !draft) {
        return (
            <>
                {heading()}
                <NoContactsYet onAdded={onContactAdded} />
            </>
        );
    }

    const buttons = (foot: boolean) => (
        <FormButtons
            foot={foot}
            off={busy || noLine}
            intent={intent}
            issueLabel={withLink ? ISSUE_AND_SHARE : ISSUE_IT}
            describedBy={noLine && typed ? ids.why : undefined}
            onIssue={() => void press("issue")()}
        />
    );

    return (
        <>
            {details.step}
            {guard.dialog}
            <form
                onKeyDown={submitOnModEnter}
                onSubmit={press("draft")}
                noValidate
            >
                {heading(
                    <SavePill
                        state={saving.state}
                        hasDraft={saving.id !== null}
                        onRetry={() => void saving.flush()}
                    />,
                    <div className="flex gap-2 max-sm:hidden">
                        {mode === "paper" ? (
                            <SeeAsCustomer paper={paper} />
                        ) : null}
                        {buttons(false)}
                    </div>,
                    <Segmented<Mode>
                        label="How to write it"
                        value={mode}
                        onValueChange={setMode}
                        options={[
                            { value: "form", label: "Form" },
                            { value: "paper", label: "On the paper" },
                        ]}
                    />,
                )}
                {mode === "paper" ? (
                    <PaperEditor
                        form={form}
                        lines={lines}
                        paper={paper}
                        business={biz}
                        businessName={businessName}
                        registered={registered}
                        currency={currency}
                        zone={zone}
                        now={now}
                        draftDueAt={draft?.dueAt ?? null}
                        customer={{
                            contacts,
                            canAdd: !draft,
                            onContactAdded,
                            registered,
                            businessState: biz?.state ?? null,
                            buyerOpen,
                            onOpenBuyer: () => setBuyerOpen(true),
                        }}
                        canPickProducts={canPickProducts}
                        priceMode={biz?.priceMode ?? null}
                        disabled={busy}
                        canSetDefault={canSetDefault && biz !== null}
                        onSettings={onSettings}
                        flush={saving.flush}
                    />
                ) : (
                    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_440px]">
                        {/* One column that never grows past the form: an auto
                        track took the picker's whole "name · email" as its
                        least width, and a long email zoomed a phone out. */}
                        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
                            <CustomerBlock
                                form={form}
                                contacts={contacts}
                                canAdd={!draft}
                                onContactAdded={onContactAdded}
                                registered={registered}
                                businessState={biz?.state ?? null}
                                buyerOpen={buyerOpen}
                                onOpenBuyer={() => setBuyerOpen(true)}
                                disabled={busy}
                            />
                            <LinesTable
                                form={form}
                                lines={lines}
                                currency={currency}
                                registered={registered}
                                canPickProducts={canPickProducts}
                                priceMode={biz?.priceMode ?? null}
                                disabled={busy}
                            />
                            <section className="rounded-[12px] border border-border bg-card px-4 py-[13px]">
                                <h2 className="label mb-2">Due</h2>
                                <DueStrip
                                    value={values.due}
                                    onChange={(due) =>
                                        form.setValue("due", due, {
                                            shouldDirty: true,
                                        })
                                    }
                                    draftDueAt={draft?.dueAt ?? null}
                                    zone={zone}
                                    now={now}
                                />
                            </section>
                            <SeeItToggle
                                open={seeIt}
                                controls={ids.preview}
                                onToggle={() => setSeeIt((v) => !v)}
                            />
                        </div>

                        <PreviewAside
                            id={ids.preview}
                            open={seeIt}
                            paper={paper}
                            business={biz}
                            withLink={withLink}
                        />
                    </div>
                )}
                {noLine && typed ? (
                    <p
                        id={ids.why}
                        className="mt-3 text-[12px] text-destructive-subtle-foreground"
                    >
                        Add at least one line with a description, quantity and
                        price.
                    </p>
                ) : null}

                <PhoneFoot total={formatMoney(sums.totalCents, currency)}>
                    {buttons(true)}
                </PhoneFoot>
            </form>
        </>
    );
}
