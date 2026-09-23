"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import type { FieldErrors } from "react-hook-form";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { ContactPicker } from "@/components/shared/contact-picker";
import { OptionSelect } from "@/components/shared/option-select";
import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import {
    createInvoice,
    createPayLink,
    issueInvoice,
    updateInvoice,
} from "@/lib/invoices/actions";
import type { GstRateValue } from "@/lib/invoices/gst";
import {
    GST_RATE_OPTIONS,
    GST_STATES,
    GSTIN_SHAPE,
    isHsnSac,
    rateOption,
} from "@/lib/invoices/gst";
import type { Invoice } from "@/lib/invoices/service";

const MONEY = /^\d{1,9}(\.\d{1,2})?$/;

/** When it falls due, as the design offers it: days after today. */
const DUES = [
    { days: 0, label: "On receipt" },
    { days: 7, label: "In 7 days" },
    { days: 14, label: "In 14 days" },
    { days: 30, label: "In 30 days" },
] as const;

const STATES = [{ value: "", label: "Same as yours" }, ...GST_STATES] as const;

const formSchema = z.object({
    contactId: z.string().min(1, { message: "Choose who it's for" }),
    /** Days from today, or "kept" for a draft's own due date. */
    due: z.union([z.number(), z.literal("kept")]),
    billToGstin: z
        .string()
        .trim()
        .toUpperCase()
        .refine((v) => v === "" || GSTIN_SHAPE.test(v), {
            message: "A GSTIN is 15 characters, like 29AAGCR4375J1ZU",
        }),
    billToState: z.string(),
    billToAddress: z.string().trim().max(500),
    lines: z
        .array(
            z.object({
                description: z
                    .string()
                    .trim()
                    .min(1, { message: "Say what it's for" })
                    .max(200),
                quantity: z
                    .number({ message: "A whole number" })
                    .int({ message: "A whole number" })
                    .min(1, { message: "At least 1" })
                    .max(9999),
                unitPrice: z.string().trim().regex(MONEY, {
                    message: "A price, with at most two decimals",
                }),
                gstRate: z.string(),
                hsnSac: z
                    .string()
                    .trim()
                    .refine((v) => v === "" || isHsnSac(v), {
                        message: "An HSN or SAC is 4 to 8 digits",
                    }),
            }),
        )
        .min(1, { message: "Add a line" }),
});

type FormValues = z.infer<typeof formSchema>;

/** Minor units, for the running total only; the API prices the invoice. */
const toCents = (s: string | undefined) => {
    const t = (s ?? "").trim();
    if (!MONEY.test(t)) return 0;
    const [whole, frac = ""] = t.split(".");
    return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
};

/** The end of the day `days` from now, so "due 15 Sep" is overdue from the 16th. */
function dueFrom(days: number): string {
    const d = new Date();
    return new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate() + days,
        23,
        59,
        59,
    ).toISOString();
}

async function copy(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

/**
 * A hand-written invoice — new, or a draft being changed — after "Saroh
 * Invoice Detail" (?new=1): who it is billed to, its lines, when it falls
 * due, and the total beside them. For trade and one-off work; orders and
 * subscriptions make their own.
 *
 * A GST-registered business gives each line its rate and HSN/SAC and may
 * add the buyer's GSTIN and state — the state is the place of supply, so
 * another state than the business's is IGST. Prices include GST; the API
 * works the tax out and freezes it when the invoice is issued.
 *
 * Nothing is sent: "Issue with pay link" numbers it, locks its lines and
 * copies its pay link for the merchant to send. The running total is the
 * only sum the browser does, and only to read.
 */
export function InvoiceForm({
    contacts,
    defaultCurrency,
    draft,
    initialContactId,
    registered,
    businessName,
    providerConnected,
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
    /** A payment provider is connected, so issuing can make a pay link. */
    providerConnected: boolean;
}) {
    const router = useRouter();
    const ids = {
        contact: useId(),
        gstin: useId(),
        state: useId(),
        address: useId(),
    };
    const [intent, setIntent] = useState<"issue" | "draft">("issue");
    const hasBuyerGst = Boolean(
        draft?.billToGst?.gstin ??
        draft?.billToGst?.state ??
        draft?.billToGst?.address,
    );
    const [buyerOpen, setBuyerOpen] = useState(hasBuyerGst);
    const currency = draft?.currency ?? defaultCurrency;

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
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
                : [
                      {
                          description: "",
                          quantity: 1,
                          unitPrice: "",
                          gstRate: "",
                          hsnSac: "",
                      },
                  ],
        },
    });
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "lines",
    });
    const { isSubmitting, errors } = form.formState;
    const lines = useWatch({ control: form.control, name: "lines" });
    const due = useWatch({ control: form.control, name: "due" });

    const good = lines.filter(
        (l) =>
            l.description.trim() &&
            Number(l.quantity) > 0 &&
            toCents(l.unitPrice) > 0,
    );
    const total = good.reduce(
        (sum, l) => sum + Number(l.quantity) * toCents(l.unitPrice),
        0,
    );
    const noLine = good.length === 0;
    const typed = lines.some((l) => l.description || l.unitPrice);
    const show = (cents: number) =>
        formatMoneyMajor(cents / 100, currency) ?? String(cents / 100);
    const withLink = providerConnected;

    async function onSubmit(values: FormValues) {
        const input = {
            contactId: values.contactId,
            ...(draft ? {} : { currency, tax: "0" }),
            dueAt:
                values.due === "kept"
                    ? (draft?.dueAt ?? null)
                    : dueFrom(values.due),
            lines: values.lines.map((l) => ({
                description: l.description.trim(),
                quantity: l.quantity,
                unitPrice: l.unitPrice.trim(),
                ...(registered && l.gstRate ? { gstRate: l.gstRate } : {}),
                ...(registered && l.hsnSac.trim()
                    ? { hsnSac: l.hsnSac.replace(/\s+/g, "") }
                    : {}),
            })),
            ...(registered
                ? {
                      billToGstin: values.billToGstin,
                      billToState: values.billToState,
                      billToAddress: values.billToAddress,
                  }
                : {}),
        };
        const saved = draft
            ? await updateInvoice(draft.id, input)
            : await createInvoice(input);
        if (!saved.ok) {
            const field = saved.field;
            if (
                field === "contactId" ||
                field === "billToGstin" ||
                field === "billToState"
            ) {
                if (field !== "contactId") setBuyerOpen(true);
                form.setError(field, { message: saved.error });
            } else {
                showError(saved.error);
            }
            return;
        }
        const id = saved.data.id;
        const to = `/billing/invoices/${id}`;
        if (intent === "draft") {
            showSuccess(
                `Saved as a draft for ${saved.data.contact?.name ?? "them"}. No number yet.`,
            );
            router.push(to);
            return;
        }
        const issued = await issueInvoice(id);
        if (!issued.ok) {
            // The draft is saved; only issuing failed. Say which.
            showError(`Saved as a draft, but not issued: ${issued.error}`);
            router.push(to);
            return;
        }
        const number = issued.data.number ?? "Invoice";
        if (!withLink) {
            showSuccess(`${number} issued. Its lines are locked.`);
            router.push(to);
            return;
        }
        const link = await createPayLink(id);
        if (!link.ok) {
            showError(
                `${number} issued, but no pay link was made: ${link.error}`,
            );
        } else if (await copy(link.data.url)) {
            showSuccess(
                `${number} issued and its pay link copied. Send it to ${issued.data.contact?.name ?? "them"}.`,
            );
        } else {
            showError(
                `${number} issued, but its pay link couldn't be copied. Copy a new one from the invoice.`,
            );
        }
        router.push(to);
    }

    function onInvalid(errs: FieldErrors<FormValues>) {
        if (errs.billToGstin || errs.billToState) setBuyerOpen(true);
        if (errs.lines?.root?.message ?? errs.lines?.message) {
            showError(String(errs.lines.root?.message ?? errs.lines.message));
        }
    }

    if (contacts.length === 0 && !draft) {
        return (
            <div className="max-w-xl rounded-[12px] border border-border bg-card p-5 text-[13.5px]">
                <p className="text-muted-foreground">
                    An invoice is for someone in your contacts, and there is no
                    one there yet — or Contacts is switched off.
                </p>
                <Button variant="outline" asChild className="mt-4">
                    <Link href="/contacts">Go to Contacts</Link>
                </Button>
            </div>
        );
    }

    const chip = (on: boolean) =>
        cn(
            "h-8 rounded-full border px-3 text-[12.5px] transition-colors duration-fast coarse:h-11",
            on
                ? "border-foreground bg-primary font-semibold text-primary-foreground"
                : "border-border bg-card font-medium text-muted-foreground hover:text-foreground",
        );

    return (
        <form
            onSubmit={form.handleSubmit(onSubmit, onInvalid)}
            className="flex flex-wrap items-start gap-4"
            noValidate
        >
            <div className="grid min-w-0 flex-[3_1_440px] gap-3">
                <Card label="Billed to">
                    <Controller
                        control={form.control}
                        name="contactId"
                        render={({ field }) => (
                            <ContactPicker
                                id={ids.contact}
                                contacts={contacts}
                                value={field.value}
                                onValueChange={field.onChange}
                                disabled={isSubmitting}
                                aria-label="Who it's for"
                                aria-invalid={Boolean(errors.contactId)}
                            />
                        )}
                    />
                    {errors.contactId ? (
                        <p className="mt-1.5 text-[12px] text-destructive-subtle-foreground">
                            {errors.contactId.message}
                        </p>
                    ) : null}
                    {registered ? (
                        buyerOpen ? (
                            <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                                <div className="grid content-start gap-1.5">
                                    <Label
                                        htmlFor={ids.gstin}
                                        className="text-[12.5px]"
                                    >
                                        Their GSTIN{" "}
                                        <span className="font-normal text-muted-foreground">
                                            (if registered)
                                        </span>
                                    </Label>
                                    <Input
                                        id={ids.gstin}
                                        maxLength={15}
                                        autoCapitalize="characters"
                                        placeholder="29AAGFL5531Q1ZO"
                                        className="h-9 font-mono text-[13px] uppercase"
                                        aria-invalid={Boolean(
                                            errors.billToGstin,
                                        )}
                                        disabled={isSubmitting}
                                        {...form.register("billToGstin")}
                                    />
                                    {errors.billToGstin ? (
                                        <p className="text-[12px] text-destructive-subtle-foreground">
                                            {errors.billToGstin.message}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="grid content-start gap-1.5">
                                    <Label
                                        htmlFor={ids.state}
                                        className="text-[12.5px]"
                                    >
                                        Their state
                                    </Label>
                                    <Controller
                                        control={form.control}
                                        name="billToState"
                                        render={({ field }) => (
                                            <OptionSelect
                                                id={ids.state}
                                                value={field.value}
                                                onValueChange={field.onChange}
                                                options={STATES}
                                                disabled={isSubmitting}
                                                aria-invalid={Boolean(
                                                    errors.billToState,
                                                )}
                                            />
                                        )}
                                    />
                                    <p className="text-[12px] text-muted-foreground">
                                        {errors.billToState?.message ??
                                            "The place of supply. Another state than yours is IGST."}
                                    </p>
                                </div>
                                <div className="grid gap-1.5 sm:col-span-2">
                                    <Label
                                        htmlFor={ids.address}
                                        className="text-[12.5px]"
                                    >
                                        Their address, as it prints
                                    </Label>
                                    <Textarea
                                        id={ids.address}
                                        rows={2}
                                        maxLength={500}
                                        className="text-[13px]"
                                        disabled={isSubmitting}
                                        {...form.register("billToAddress")}
                                    />
                                </div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setBuyerOpen(true)}
                                className="mt-2 py-1 text-[12.5px] font-semibold text-brand hover:text-foreground"
                            >
                                + Their GSTIN, state and address
                            </button>
                        )
                    ) : null}
                </Card>

                <Card label="Lines">
                    <ul className="grid gap-1.5">
                        {fields.map((line, i) => {
                            const lineErr = errors.lines?.[i];
                            return (
                                <li key={line.id} className="grid gap-1.5">
                                    <div className="grid grid-cols-[minmax(0,3fr)_70px_100px_30px] gap-1.5">
                                        <Input
                                            aria-label={`Line ${i + 1}: what it's for`}
                                            placeholder="What it's for"
                                            className="h-9 rounded-[8px] text-[13px]"
                                            disabled={isSubmitting}
                                            aria-invalid={Boolean(
                                                lineErr?.description,
                                            )}
                                            {...form.register(
                                                `lines.${i}.description`,
                                            )}
                                        />
                                        <Input
                                            aria-label={`Line ${i + 1}: quantity`}
                                            inputMode="numeric"
                                            className="h-9 rounded-[8px] text-[13px] tabular-nums"
                                            disabled={isSubmitting}
                                            aria-invalid={Boolean(
                                                lineErr?.quantity,
                                            )}
                                            {...form.register(
                                                `lines.${i}.quantity`,
                                                {
                                                    valueAsNumber: true,
                                                },
                                            )}
                                        />
                                        <Input
                                            aria-label={`Line ${i + 1}: price each, ${currency}`}
                                            inputMode="decimal"
                                            placeholder="₹ each"
                                            className="h-9 rounded-[8px] text-[13px] tabular-nums"
                                            disabled={isSubmitting}
                                            aria-invalid={Boolean(
                                                lineErr?.unitPrice,
                                            )}
                                            {...form.register(
                                                `lines.${i}.unitPrice`,
                                            )}
                                        />
                                        <button
                                            type="button"
                                            aria-label={`Remove line ${i + 1}`}
                                            disabled={isSubmitting}
                                            onClick={() =>
                                                fields.length > 1
                                                    ? remove(i)
                                                    : form.setValue(`lines.0`, {
                                                          description: "",
                                                          quantity: 1,
                                                          unitPrice: "",
                                                          gstRate: "",
                                                          hsnSac: "",
                                                      })
                                            }
                                            className="grid place-items-center rounded-[8px] text-muted-foreground hover:bg-muted hover:text-foreground"
                                        >
                                            <X aria-hidden className="size-4" />
                                        </button>
                                    </div>
                                    {registered ? (
                                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_30px] gap-1.5 sm:grid-cols-[170px_140px_1fr]">
                                            <Controller
                                                control={form.control}
                                                name={`lines.${i}.gstRate`}
                                                render={({ field }) => (
                                                    <OptionSelect
                                                        size="sm"
                                                        aria-label={`Line ${i + 1}: GST rate`}
                                                        value={
                                                            field.value as GstRateValue
                                                        }
                                                        onValueChange={
                                                            field.onChange
                                                        }
                                                        options={
                                                            GST_RATE_OPTIONS
                                                        }
                                                        placeholder="GST rate"
                                                        disabled={isSubmitting}
                                                    />
                                                )}
                                            />
                                            <Input
                                                aria-label={`Line ${i + 1}: HSN or SAC`}
                                                placeholder="HSN / SAC"
                                                inputMode="numeric"
                                                className="h-8 rounded-[8px] font-mono text-[12px]"
                                                disabled={isSubmitting}
                                                aria-invalid={Boolean(
                                                    lineErr?.hsnSac,
                                                )}
                                                {...form.register(
                                                    `lines.${i}.hsnSac`,
                                                )}
                                            />
                                        </div>
                                    ) : null}
                                    {lineErr ? (
                                        <p className="text-[12px] text-destructive-subtle-foreground">
                                            {lineErr.description?.message ??
                                                lineErr.quantity?.message ??
                                                lineErr.unitPrice?.message ??
                                                lineErr.hsnSac?.message}
                                        </p>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                    <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() =>
                            append({
                                description: "",
                                quantity: 1,
                                unitPrice: "",
                                gstRate: "",
                                hsnSac: "",
                            })
                        }
                        className="mt-1 py-1.5 text-[12.5px] font-semibold text-brand hover:text-foreground"
                    >
                        + Add a line
                    </button>
                    {registered ? (
                        <p className="mt-1 text-[12px] text-muted-foreground">
                            Prices include GST. A line with no rate is nil-rated
                            (0%).
                        </p>
                    ) : null}
                </Card>

                <Card label="Due">
                    <div
                        role="radiogroup"
                        aria-label="Due"
                        className="flex flex-wrap items-center gap-1.5"
                    >
                        {draft?.dueAt ? (
                            <button
                                type="button"
                                role="radio"
                                aria-checked={due === "kept"}
                                onClick={() => form.setValue("due", "kept")}
                                className={chip(due === "kept")}
                            >
                                <ViewerDate
                                    iso={draft.dueAt}
                                    variant="dayMonth"
                                />
                            </button>
                        ) : null}
                        {DUES.map((d) => (
                            <button
                                key={d.days}
                                type="button"
                                role="radio"
                                aria-checked={due === d.days}
                                onClick={() => form.setValue("due", d.days)}
                                className={chip(due === d.days)}
                            >
                                {d.label}
                            </button>
                        ))}
                    </div>
                </Card>
            </div>

            <aside className="min-w-0 flex-[2_1_260px] rounded-[12px] border border-border bg-card px-4 py-3.5 lg:sticky lg:top-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Total
                </h2>
                <p className="mb-0.5 mt-1 font-display text-[28px] font-semibold tabular-nums tracking-[-0.02em]">
                    {show(total)}
                </p>
                <p className="text-[12px] text-muted-foreground">
                    {registered
                        ? "GST worked out per line when it's issued — prices include it."
                        : `No GST — ${businessName} isn't registered.`}
                </p>
                <p className="mt-3 text-[12.5px] leading-[1.5] text-foreground">
                    A draft has no number and can still change. Issuing numbers
                    it and locks the lines
                    {withLink
                        ? ", and copies its pay link for you to send — Saroh doesn't send it."
                        : " — Saroh doesn't send it; print it or share it yourself."}
                </p>
                <div className="mt-3 flex flex-col gap-2">
                    <Button
                        type="submit"
                        disabled={isSubmitting || noLine}
                        onClick={() => setIntent("issue")}
                        className="h-10 rounded-[10px] text-[13.5px]"
                    >
                        {isSubmitting && intent === "issue"
                            ? "Issuing…"
                            : withLink
                              ? "Issue with pay link"
                              : "Issue it"}
                    </Button>
                    <Button
                        type="submit"
                        variant="outline"
                        disabled={isSubmitting || noLine}
                        onClick={() => setIntent("draft")}
                        className="h-10 rounded-[10px] text-[13.5px]"
                    >
                        {isSubmitting && intent === "draft"
                            ? "Saving…"
                            : draft
                              ? "Save the draft"
                              : "Save as draft"}
                    </Button>
                </div>
                {noLine && typed ? (
                    <p className="mt-2 text-[12px] text-destructive-subtle-foreground">
                        Add at least one line with a description, quantity and
                        price.
                    </p>
                ) : null}
            </aside>
        </form>
    );
}

function Card({ label, children }: { label: string; children: ReactNode }) {
    return (
        <section className="rounded-[12px] border border-border bg-card px-4 py-[13px]">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {label}
            </h2>
            {children}
        </section>
    );
}
