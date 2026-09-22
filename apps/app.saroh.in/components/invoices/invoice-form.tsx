"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@saroh/ui/button";
import { DatePicker } from "@saroh/ui/date-picker";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { FieldErrors } from "react-hook-form";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { ContactPicker } from "@/components/shared/contact-picker";
import { OptionSelect } from "@/components/shared/option-select";
import {
    createInvoice,
    issueInvoice,
    updateInvoice,
} from "@/lib/invoices/actions";
import { invoiceMoney } from "@/lib/invoices/money";
import type { Invoice } from "@/lib/invoices/service";

const MONEY = /^\d{1,9}(\.\d{1,2})?$/;

/** Currencies offered; the invoice keeps whichever is chosen. */
const CURRENCIES = ["INR", "USD", "GBP", "EUR", "AED", "SGD", "AUD", "CAD"];

const formSchema = z.object({
    contactId: z.string().min(1, { message: "Choose who it's for" }),
    dueAt: z.date().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    tax: z
        .string()
        .trim()
        .regex(MONEY, { message: "An amount, with at most two decimals" }),
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
                    message: "An amount, with at most two decimals",
                }),
            }),
        )
        .min(1, { message: "Add a line" }),
});

type FormValues = z.infer<typeof formSchema>;

/** Minor units, for the running total only; the API prices the invoice. */
const toCents = (s: string) => {
    if (!MONEY.test(s.trim())) return 0;
    const [whole, frac = ""] = s.trim().split(".");
    return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
};
const fromCents = (c: number) => (c / 100).toFixed(2);
const qty = (n: number | undefined) =>
    n !== undefined && Number.isFinite(n) ? n : 0;

/** The end of a picked day, so "due 15 Sep" is overdue from the 16th. */
function endOfDay(d: Date): string {
    return new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        23,
        59,
        59,
    ).toISOString();
}

/**
 * A manual invoice — new, or a draft being changed — after the "Saroh
 * Billing and Classes" design: who it's for and when it's due, a line editor,
 * and a running total beside it.
 *
 * The running total is the only sum the browser works out, and only for
 * reading; the API prices the invoice from the lines it is sent. Nothing is
 * saved until one of the two buttons is chosen. "Issue it" saves and issues
 * in one go; issuing gives it a number and locks its lines.
 */
export function InvoiceForm({
    contacts,
    defaultCurrency,
    draft,
    initialContactId,
}: {
    contacts: { id: string; name: string; email: string }[];
    defaultCurrency: string;
    /** The draft being changed; absent for a new invoice. */
    draft?: Invoice;
    /** Who a new invoice is for, already chosen — from a contact's page. */
    initialContactId?: string;
}) {
    const router = useRouter();
    const ids = { contact: useId(), due: useId(), tax: useId(), cur: useId() };
    const [intent, setIntent] = useState<"issue" | "draft">("issue");

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            contactId: draft?.contact?.id ?? initialContactId ?? "",
            dueAt: draft?.dueAt ? new Date(draft.dueAt) : undefined,
            currency: draft?.currency ?? defaultCurrency,
            tax: draft ? draft.tax : "0",
            lines: draft?.lines?.length
                ? draft.lines.map((l) => ({
                      description: l.description,
                      quantity: l.quantity,
                      unitPrice: l.unitPrice,
                  }))
                : [{ description: "", quantity: 1, unitPrice: "" }],
        },
    });
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "lines",
    });
    const { isSubmitting, errors } = form.formState;

    const lines = form.watch("lines");
    const currency = form.watch("currency");
    const subtotal = lines.reduce(
        (sum, l) => sum + qty(l.quantity) * toCents(l.unitPrice),
        0,
    );
    const tax = toCents(form.watch("tax"));
    const show = (cents: number) => invoiceMoney(fromCents(cents), currency);

    async function onSubmit(values: FormValues) {
        const input = {
            contactId: values.contactId,
            currency: values.currency,
            tax: values.tax.trim(),
            dueAt: values.dueAt ? endOfDay(values.dueAt) : null,
            lines: values.lines.map((l) => ({
                description: l.description.trim(),
                quantity: l.quantity,
                unitPrice: l.unitPrice.trim(),
            })),
        };
        const saved = draft
            ? await updateInvoice(draft.id, input)
            : await createInvoice(input);
        if (!saved.ok) {
            if (saved.field === "contactId" || saved.field === "tax") {
                form.setError(saved.field, { message: saved.error });
            } else {
                showError(saved.error);
            }
            return;
        }
        const id = saved.data.id;
        if (intent === "draft") {
            showSuccess("Saved as a draft");
            router.push(`/billing/invoices/${id}`);
            return;
        }
        const issued = await issueInvoice(id);
        if (!issued.ok) {
            // The draft is saved; only issuing failed. Say which.
            showError(`Saved as a draft, but not issued: ${issued.error}`);
            router.push(`/billing/invoices/${id}`);
            return;
        }
        showSuccess(`${issued.data.number ?? "Invoice"} issued`);
        router.push(`/billing/invoices/${id}`);
    }

    function onInvalid(errs: FieldErrors<FormValues>) {
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

    return (
        <form
            onSubmit={form.handleSubmit(onSubmit, onInvalid)}
            className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]"
        >
            <div className="flex min-w-0 flex-col gap-6">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid min-w-0 content-start gap-1.5">
                        <Label htmlFor={ids.contact}>Who it&apos;s for</Label>
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
                                    aria-invalid={Boolean(errors.contactId)}
                                />
                            )}
                        />
                        {errors.contactId ? (
                            <p className="text-[12px] text-destructive-subtle-foreground">
                                {errors.contactId.message}
                            </p>
                        ) : (
                            <p className="text-[12px] text-muted-foreground">
                                From your contacts.
                            </p>
                        )}
                    </div>
                    <div className="grid min-w-0 content-start gap-1.5">
                        <Label htmlFor={ids.due}>Due</Label>
                        <Controller
                            control={form.control}
                            name="dueAt"
                            render={({ field }) => (
                                <DatePicker
                                    id={ids.due}
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    placeholder="Seven days after issue"
                                    disabled={isSubmitting}
                                    className="w-full"
                                    disabledDays={{ before: new Date() }}
                                />
                            )}
                        />
                        <p className="text-[12px] text-muted-foreground">
                            Seven days after you issue it, unless you change it.
                        </p>
                    </div>
                </div>

                <fieldset className="grid gap-2">
                    <legend className="mb-2 text-[13px] font-medium">
                        Lines
                    </legend>
                    <div className="overflow-hidden rounded-[12px] border border-border bg-card">
                        <div
                            aria-hidden
                            className="hidden grid-cols-[minmax(0,1fr)_72px_120px_104px_44px] gap-2 border-b border-border bg-muted/40 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:grid"
                        >
                            <span>Description</span>
                            <span className="text-right">Qty</span>
                            <span className="text-right">Each</span>
                            <span className="text-right">Amount</span>
                            <span />
                        </div>
                        <ul>
                            {fields.map((line, i) => {
                                const watched = lines.at(i);
                                const lineErr = errors.lines?.[i];
                                return (
                                    <li
                                        key={line.id}
                                        className="grid grid-cols-[72px_minmax(0,1fr)_44px] gap-2 border-b border-border px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_72px_120px_104px_44px] sm:items-center"
                                    >
                                        <Input
                                            aria-label={`Line ${i + 1} description`}
                                            placeholder="What it's for"
                                            disabled={isSubmitting}
                                            aria-invalid={Boolean(
                                                lineErr?.description,
                                            )}
                                            className="col-span-3 sm:col-span-1"
                                            {...form.register(
                                                `lines.${i}.description`,
                                            )}
                                        />
                                        <Input
                                            aria-label={`Line ${i + 1} quantity`}
                                            inputMode="numeric"
                                            disabled={isSubmitting}
                                            aria-invalid={Boolean(
                                                lineErr?.quantity,
                                            )}
                                            className="text-right tabular-nums"
                                            {...form.register(
                                                `lines.${i}.quantity`,
                                                { valueAsNumber: true },
                                            )}
                                        />
                                        <Input
                                            aria-label={`Line ${i + 1} price each`}
                                            inputMode="decimal"
                                            placeholder="0.00"
                                            disabled={isSubmitting}
                                            aria-invalid={Boolean(
                                                lineErr?.unitPrice,
                                            )}
                                            className="text-right tabular-nums"
                                            {...form.register(
                                                `lines.${i}.unitPrice`,
                                            )}
                                        />
                                        <span className="hidden text-right font-display text-[13.5px] tabular-nums sm:block">
                                            {show(
                                                qty(watched?.quantity) *
                                                    toCents(
                                                        watched?.unitPrice ??
                                                            "",
                                                    ),
                                            )}
                                        </span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-11"
                                            aria-label={`Remove line ${i + 1}`}
                                            disabled={
                                                isSubmitting ||
                                                fields.length === 1
                                            }
                                            onClick={() => remove(i)}
                                        >
                                            <X className="size-4" />
                                        </Button>
                                        {lineErr ? (
                                            <p className="col-span-full text-[12px] text-destructive-subtle-foreground">
                                                {lineErr.description?.message ??
                                                    lineErr.quantity?.message ??
                                                    lineErr.unitPrice?.message}
                                            </p>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="p-3">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-dashed"
                                disabled={isSubmitting}
                                onClick={() =>
                                    append({
                                        description: "",
                                        quantity: 1,
                                        unitPrice: "",
                                    })
                                }
                            >
                                <Plus className="mr-1.5 size-4" />
                                Add a line
                            </Button>
                        </div>
                    </div>
                </fieldset>
            </div>

            <aside className="rounded-[12px] border border-border bg-muted/40 p-5 lg:sticky lg:top-[80px] lg:row-span-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Running total
                </h2>
                <dl className="mt-3 grid gap-2.5 text-[13.5px]">
                    <div className="flex items-center justify-between gap-3">
                        <dt>
                            {fields.length}{" "}
                            {fields.length === 1 ? "line" : "lines"}
                        </dt>
                        <dd className="font-display tabular-nums">
                            {show(subtotal)}
                        </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <dt>
                            <Label htmlFor={ids.tax} className="font-normal">
                                Tax
                            </Label>
                        </dt>
                        <dd>
                            <Input
                                id={ids.tax}
                                inputMode="decimal"
                                disabled={isSubmitting}
                                aria-invalid={Boolean(errors.tax)}
                                className="h-11 w-[120px] text-right tabular-nums"
                                {...form.register("tax")}
                            />
                        </dd>
                    </div>
                    {errors.tax ? (
                        <p className="text-right text-[12px] text-destructive-subtle-foreground">
                            {errors.tax.message}
                        </p>
                    ) : null}
                    <div className="flex items-center justify-between gap-3">
                        <dt>
                            <Label htmlFor={ids.cur} className="font-normal">
                                Currency
                            </Label>
                        </dt>
                        <dd className="w-[120px]">
                            <Controller
                                control={form.control}
                                name="currency"
                                render={({ field }) => (
                                    <OptionSelect
                                        id={ids.cur}
                                        value={field.value}
                                        onValueChange={field.onChange}
                                        disabled={isSubmitting}
                                        options={CURRENCIES.map((c) => ({
                                            value: c,
                                            label: c,
                                        }))}
                                    />
                                )}
                            />
                        </dd>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-3">
                        <dt className="font-display text-[17px] font-semibold">
                            Total
                        </dt>
                        <dd className="font-display text-[20px] font-semibold tabular-nums tracking-[-0.025em]">
                            {show(subtotal + tax)}
                        </dd>
                    </div>
                </dl>
                <p className="mt-3 text-[12px] text-muted-foreground">
                    Edit a line and this moves. Nothing is saved until you
                    choose below.
                </p>
            </aside>

            {/* After the running total on a phone, so the tax is seen
                before anything is issued; under the lines on a desk. */}
            <div className="flex flex-wrap items-center gap-3 lg:col-start-1">
                <Button
                    type="submit"
                    disabled={isSubmitting}
                    onClick={() => setIntent("issue")}
                >
                    {isSubmitting && intent === "issue"
                        ? "Issuing…"
                        : "Issue it"}
                </Button>
                <Button
                    type="submit"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={() => setIntent("draft")}
                >
                    {draft ? "Save the draft" : "Keep as a draft"}
                </Button>
                <p className="text-[12.5px] text-muted-foreground">
                    Issuing gives it a number and locks the lines.
                </p>
            </div>
        </form>
    );
}
