"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { OptionSelect } from "@saroh/ui/option-select";
import { Textarea } from "@saroh/ui/textarea";
import Link from "next/link";
import { useId } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";

import type { AddedContact } from "@/components/contacts/add-contact-dialog";
import { AddContactDialog } from "@/components/contacts/add-contact-dialog";
import type { ContactOption } from "@/components/shared/fields/contact-picker";
import { ContactPicker } from "@/components/shared/fields/contact-picker";
import { GST_STATES } from "@/lib/invoices/gst";
import type { InvoiceFormValues } from "@/lib/invoices/new-invoice";
import { supplyLine } from "@/lib/invoices/new-invoice";

const STATES = [{ value: "", label: "Same as yours" }, ...GST_STATES] as const;

/**
 * Billed to (INVNewA): who it's for, picked or added in place, and on a
 * GST-registered business the buyer's GSTIN, state and address, with the
 * place of supply worked out under them: "GSTIN 29ABCFB2207K1ZL ·
 * Karnataka: CGST + SGST". Every field of today's form is here; the
 * buyer's three stay behind their link until wanted, or open when the
 * draft has any of them.
 */
export function CustomerBlock({
    form,
    contacts,
    canAdd,
    onContactAdded,
    registered,
    businessState,
    buyerOpen,
    onOpenBuyer,
    disabled,
    bare = false,
}: {
    form: UseFormReturn<InvoiceFormValues>;
    contacts: readonly ContactOption[];
    /** A new invoice may add someone; a draft keeps who it's for. */
    canAdd: boolean;
    onContactAdded: (c: AddedContact) => void;
    registered: boolean;
    /** The business's GST state code, for the place of supply. */
    businessState: string | null;
    buyerOpen: boolean;
    onOpenBuyer: () => void;
    disabled: boolean;
    /**
     * Drawn inside the paper's Billed to editor (U15): no card and no
     * heading of its own, the editor's title naming it.
     */
    bare?: boolean;
}) {
    const ids = {
        contact: useId(),
        gstin: useId(),
        state: useId(),
        address: useId(),
        supply: useId(),
    };
    const { errors } = form.formState;
    const [billToGstin, billToState] = useWatch({
        control: form.control,
        name: ["billToGstin", "billToState"],
    });
    const supply = registered
        ? supplyLine({ billToGstin, billToState }, businessState)
        : null;

    return (
        <section
            aria-labelledby={`${ids.contact}-label`}
            className={
                bare
                    ? "min-w-0"
                    : "rounded-[12px] border border-border bg-card px-4 py-[13px]"
            }
        >
            <h2
                id={`${ids.contact}-label`}
                className={bare ? "sr-only" : "label mb-2"}
            >
                Billed to
            </h2>
            <Controller
                control={form.control}
                name="contactId"
                render={({ field }) => (
                    <ContactPicker
                        id={ids.contact}
                        contacts={contacts}
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={disabled}
                        aria-label="Who it's for"
                        aria-describedby={supply ? ids.supply : undefined}
                        aria-invalid={Boolean(errors.contactId)}
                    />
                )}
            />
            {errors.contactId ? (
                <p className="mt-1.5 text-[12px] text-destructive-subtle-foreground">
                    {errors.contactId.message}
                </p>
            ) : null}
            {supply ? (
                <p
                    id={ids.supply}
                    data-testid="supply-line"
                    className="mt-1.5 text-[12px] text-muted-foreground"
                >
                    {supply}
                </p>
            ) : null}
            {canAdd ? (
                <div className="mt-1.5">
                    <NewContact onAdded={onContactAdded} />
                </div>
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
                                className="font-mono uppercase"
                                aria-invalid={Boolean(errors.billToGstin)}
                                disabled={disabled}
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
                                        disabled={disabled}
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
                                disabled={disabled}
                                {...form.register("billToAddress")}
                            />
                        </div>
                    </div>
                ) : (
                    <Button
                        variant="link"
                        size="inline"
                        type="button"
                        onClick={onOpenBuyer}
                        className="mt-2 py-1 text-foreground underline decoration-border-strong underline-offset-4 transition-colors duration-fast hover:decoration-foreground active:text-muted-foreground max-sm:min-h-11"
                    >
                        + Their GSTIN, state and address
                    </Button>
                )
            ) : null}
        </section>
    );
}

/**
 * "New contact" in Who (UX-047): adds someone without leaving the invoice,
 * and picks them. The API still decides (Contacts off, or no
 * `contact:write`), and the dialog says why it couldn't.
 */
export function NewContact({
    onAdded,
    solid = false,
}: {
    onAdded: (c: AddedContact) => void;
    solid?: boolean;
}) {
    return (
        <AddContactDialog
            onAdded={onAdded}
            description="Who this invoice is for. They're added to your contacts and picked here."
            trigger={
                <Button
                    type="button"
                    variant={solid ? "default" : "link"}
                    size="sm"
                    className={
                        solid ? undefined : "h-auto px-0 max-sm:min-h-11"
                    }
                >
                    New contact
                </Button>
            }
        />
    );
}

/**
 * A new invoice with nobody to bill yet: who it's for is added here, then
 * the invoice is written, or Contacts is a link away.
 */
export function NoContactsYet({
    onAdded,
}: {
    onAdded: (c: AddedContact) => void;
}) {
    return (
        <div className="max-w-xl rounded-[12px] border border-border bg-card p-5 text-[13.5px]">
            <p className="text-muted-foreground">
                An invoice is for someone in your contacts, and there is no one
                there yet. Add who it&apos;s for here, then write the invoice.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
                <NewContact onAdded={onAdded} solid />
                <Button variant="ghost" asChild>
                    <Link href="/contacts">Go to Contacts</Link>
                </Button>
            </div>
        </div>
    );
}
