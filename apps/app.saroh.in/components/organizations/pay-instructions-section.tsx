"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PayInstructionsCard, SiteThemeScope } from "@saroh/site-blocks";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import { showError } from "@saroh/ui/toast";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";

import type { BusinessRow } from "@/components/organizations/business-section";
import { BusinessSection } from "@/components/organizations/business-section";
import type { OfferUndo } from "@/components/organizations/use-settings-undo";
import type {
    PayField,
    PayInstructionsSettings,
    PayValues,
} from "@/lib/organizations/pay-instructions";
import {
    accountLabel,
    IFSC_EXAMPLE,
    MAX_PAY_NOTE,
    PAY_FIELDS,
    payInputOf,
    payInstructionsSchema,
    payPreviewOf,
    payValuesOf,
    UPI_EXAMPLE,
} from "@/lib/organizations/pay-instructions";
import { saveOrganizationSettings } from "@/lib/organizations/settings-actions";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";

export const PAY_SECTION = {
    title: "How to pay us",
    lead: "UPI and bank details for customers who pay you directly",
} as const;

const NOTE =
    "Shown to customers on invoices and unpaid orders, so they can pay you by UPI or bank transfer. Only someone looking at their own invoice, order or booking sees them.";

/** The fields, in the order the customer's card reads them. */
const FIELDS: {
    name: PayField;
    label: string;
    hint?: string;
    placeholder?: string;
    width: string;
    inputMode?: "text" | "numeric" | "email";
    autoCapitalize?: "none" | "characters" | "words";
    mono?: boolean;
}[] = [
    {
        name: "upiId",
        label: "UPI ID",
        hint: "Customers scan it as a QR code, or copy it into their UPI app.",
        placeholder: UPI_EXAMPLE,
        width: "basis-full",
        inputMode: "email",
        autoCapitalize: "none",
    },
    {
        name: "bankAccountName",
        label: "Name on the account",
        width: "min-w-0 flex-[1_1_240px]",
        autoCapitalize: "words",
    },
    {
        name: "bankAccountNumber",
        label: "Account number",
        width: "min-w-0 flex-[1_1_200px]",
        inputMode: "numeric",
        mono: true,
    },
    {
        name: "bankIfsc",
        label: "IFSC",
        placeholder: IFSC_EXAMPLE,
        width: "min-w-0 flex-[1_1_160px]",
        autoCapitalize: "characters",
        mono: true,
    },
    {
        name: "bankName",
        label: "Bank",
        hint: "Optional.",
        width: "min-w-0 flex-[1_1_200px]",
        autoCapitalize: "words",
    },
];

/**
 * Business → How to pay us (R32): the UPI ID, bank details and short note a
 * customer sees on their own unpaid invoice, order or desk booking, read
 * first and edited like the other cards, one at a time — with what the
 * customer will see beside it, live while editing.
 *
 * Its own form, beside the Business one (the Hours card's pattern): it
 * saves through the same settings PATCH, sending only what changed. The
 * Business form decides which card is open (`editing`) and holds the way
 * off the page while this one has changes (`onDirty`).
 */
export function PayInstructionsSection({
    saved,
    businessName,
    editing,
    canEdit,
    onEdit,
    onDone,
    onDirty,
    onSaved,
    hidden,
    offerUndo,
}: {
    /** The settings read's `payInstructions`; absent from an older API. */
    saved: PayInstructionsSettings | undefined;
    businessName: string;
    editing: boolean;
    canEdit: boolean;
    onEdit: () => void;
    /** The card closes: saved, or cancelled. */
    onDone: () => void;
    onDirty: (dirty: boolean) => void;
    /** The settings as the save answered, for the rest of the screen. */
    onSaved: (next: OrganizationSettings) => void;
    /** Another tab is showing; the card stays mounted to keep an edit. */
    hidden: boolean;
    offerUndo: OfferUndo;
}) {
    const values = payValuesOf(saved);
    const form = useForm<PayValues>({
        resolver: zodResolver(payInstructionsSchema),
        defaultValues: values,
        mode: "onChange",
    });
    const { isDirty, isSubmitting, errors } = form.formState;
    useEffect(() => {
        onDirty(isDirty);
    }, [isDirty, onDirty]);
    const live = useWatch({ control: form.control }) as PayValues;

    const problems = Object.keys(errors).length;
    const saveWhy = !isDirty
        ? "No changes yet"
        : problems === 1
          ? "1 thing to fix"
          : problems > 1
            ? `${problems} things to fix`
            : "";

    async function onSubmit(next: PayValues) {
        const input = payInputOf(next, saved);
        if (Object.keys(input).length === 0) {
            form.reset(values);
            onDone();
            return;
        }
        const res = await saveOrganizationSettings({ payInstructions: input });
        if (!res.ok) {
            if (
                res.field &&
                (PAY_FIELDS as readonly string[]).includes(res.field)
            ) {
                form.setError(res.field as PayField, { message: res.error });
            } else {
                showError(res.error);
            }
            return;
        }
        offerUndo("How to pay us saved", null);
        onSaved(res.data);
        form.reset(payValuesOf(res.data.payInstructions));
        onDone();
    }

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
    const rows: BusinessRow[] = [
        { label: "UPI ID", value: saved?.upiId ?? "", mono: true },
        { label: "Bank transfer", value: bank },
        { label: "Note", value: saved?.note ?? "", empty: "No note" },
    ];

    const preview = payPreviewOf(editing ? live : values);

    return (
        <div
            className={cn(
                "flex min-w-0 flex-[1_1_100%] flex-wrap items-start gap-5",
                hidden && "hidden",
            )}
        >
            <Form {...form}>
                <form
                    id="business-pay-panel"
                    role="tabpanel"
                    aria-labelledby="business-tab-pay"
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="grid min-w-0 flex-[1_1_460px] gap-4"
                >
                    <BusinessSection
                        title={PAY_SECTION.title}
                        lead={PAY_SECTION.lead}
                        rows={rows}
                        note={NOTE}
                        editing={editing}
                        canEdit={canEdit}
                        onEdit={() => {
                            form.reset(values);
                            onEdit();
                        }}
                        onCancel={() => {
                            form.reset(values);
                            onDone();
                        }}
                        saveOff={!isDirty || problems > 0}
                        saving={isSubmitting}
                        saveWhy={saveWhy}
                    >
                        {FIELDS.map((f) => (
                            <FormField
                                key={f.name}
                                control={form.control}
                                name={f.name}
                                render={({ field }) => (
                                    <FormItem className={f.width}>
                                        <FormLabel>{f.label}</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                autoComplete="off"
                                                spellCheck={false}
                                                inputMode={f.inputMode}
                                                autoCapitalize={
                                                    f.autoCapitalize
                                                }
                                                placeholder={f.placeholder}
                                                className={cn(
                                                    f.mono && "font-mono",
                                                )}
                                            />
                                        </FormControl>
                                        {f.hint ? (
                                            <FormDescription>
                                                {f.hint}
                                            </FormDescription>
                                        ) : null}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        ))}
                        <FormField
                            control={form.control}
                            name="note"
                            render={({ field }) => (
                                <FormItem className="basis-full">
                                    <FormLabel>Note</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            {...field}
                                            rows={2}
                                            maxLength={MAX_PAY_NOTE}
                                            placeholder="Send a screenshot to us on WhatsApp once you've paid."
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        A line under the details, up to{" "}
                                        {MAX_PAY_NOTE} characters.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </BusinessSection>
                </form>
            </Form>
            <PayPreview
                live={editing && isDirty}
                businessName={businessName}
                preview={preview}
            />
        </div>
    );
}

/**
 * "What customers see": the customer's card in a merchant site's default
 * colours, drawn by the same block their pages use.
 */
function PayPreview({
    live,
    businessName,
    preview,
}: {
    live: boolean;
    businessName: string;
    preview: PayInstructionsSettings;
}) {
    const any =
        !!preview.upiId ||
        !!(preview.bankAccountNumber && preview.bankIfsc) ||
        !!preview.note;
    return (
        <aside
            aria-label="What customers see"
            className="grid min-w-[260px] flex-[0_1_340px] gap-2 self-start min-[1100px]:sticky min-[1100px]:top-4"
        >
            <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    What customers see
                </span>
                {live ? (
                    <span className="text-[11.5px] text-brand-subtle-foreground">
                        Showing your unsaved edit
                    </span>
                ) : null}
            </div>
            {any ? (
                <SiteThemeScope name="pay-preview">
                    <PayInstructionsCard
                        instructions={preview}
                        businessName={businessName}
                        reference="Invoice INV-0001"
                    />
                </SiteThemeScope>
            ) : (
                <p className="rounded-xl border border-dashed border-border px-4 py-3 text-[12.5px] leading-normal text-muted-foreground">
                    {/* One string: text split over lines here rendered with
                        different whitespace on the server and the client,
                        a hydration mismatch (UX-086). */}
                    {`Nothing set yet. Customers see “Pay ${businessName} the way they've asked you to.”`}
                </p>
            )}
        </aside>
    );
}
