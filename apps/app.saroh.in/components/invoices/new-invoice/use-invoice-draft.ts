"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";

import { Autosave } from "@/lib/editor-shell/autosave";
import type { SaveState } from "@/lib/editor-shell/state";
import { initialSave, isSettled } from "@/lib/editor-shell/state";
import type { EditorResult } from "@/lib/editor-shell/types";
import { createInvoice, updateInvoice } from "@/lib/invoices/actions";
import type { InvoiceFormValues } from "@/lib/invoices/new-invoice";
import { draftInput, invoiceFormSchema } from "@/lib/invoices/new-invoice";
import type { Invoice } from "@/lib/invoices/service";

/** What one save answers: the invoice as the API now has it. */
interface Saved {
    revision: number;
    invoice: Invoice;
}

/** The fields a refused save can name on the form. */
const FIELDS = ["contactId", "billToGstin", "billToState"] as const;
type NamedField = (typeof FIELDS)[number];

export function isNamedField(field: string | undefined): field is NamedField {
    return (FIELDS as readonly string[]).includes(field ?? "");
}

export interface InvoiceDraft {
    /** The draft's id once one exists: a new invoice has none until saved. */
    id: string | null;
    /** The last draft the API answered with, or the one the page opened. */
    saved: Invoice | null;
    state: SaveState;
    /** Every edit is on the server: leaving loses nothing. */
    settled: boolean;
    /**
     * Save what is on screen now (Save draft, Issue, leaving): a failed
     * save is tried again. True when the server has it afterwards.
     */
    flush: () => Promise<boolean>;
    /**
     * The same, answering with the draft as the server now has it, or what
     * stood in the way (Save draft and Issue go on to the draft's page).
     */
    keep: () => Promise<
        { ok: true; invoice: Invoice } | { ok: false; error: string }
    >;
}

/**
 * New invoice (A) saves as it is typed (`frontend-forms.md`, the editor
 * shell's autosave, D6): about 800 ms after the last change, one save out at
 * a time, an older answer never saying "Saved" over a newer edit. The first
 * save makes the draft, once who it's for and every line are filled in as
 * the API takes them; each after it changes that draft. Nothing is sent
 * while a field is wrong: the form says what, as it always has.
 *
 * Once a new invoice is a draft its address becomes the draft's (`/edit`),
 * so a reload, or the browser's back and forward, comes back to it rather
 * than to an empty form and a second draft.
 */
export function useInvoiceDraft({
    form,
    draft,
    registered,
    currency,
    zone,
}: {
    form: UseFormReturn<InvoiceFormValues>;
    draft?: Invoice;
    registered: boolean;
    currency: string;
    /** The business's zone: a due day ends at its midnight. */
    zone: string;
}): InvoiceDraft {
    const [id, setId] = useState<string | null>(draft?.id ?? null);
    const [saved, setSaved] = useState<Invoice | null>(draft ?? null);
    const [state, setState] = useState<SaveState>(() => initialSave(0));
    const idRef = useRef<string | null>(draft?.id ?? null);
    const savedRef = useRef<Invoice | null>(draft ?? null);
    const ctx = useRef({
        registered,
        currency,
        zone,
        draftDueAt: draft?.dueAt,
    });
    useEffect(() => {
        ctx.current = { registered, currency, zone, draftDueAt: draft?.dueAt };
    });

    const [autosave] = useState(
        () =>
            new Autosave<InvoiceFormValues, Saved>({
                values: form.getValues(),
                revision: 0,
                onState: setState,
            }),
    );

    useEffect(() => {
        autosave.connect({
            ready: (values) => invoiceFormSchema.safeParse(values).success,
            send: async (values): Promise<EditorResult<Saved>> => {
                const current = idRef.current;
                const input = draftInput(values, {
                    ...ctx.current,
                    saved: current !== null,
                });
                const res = current
                    ? await updateInvoice(current, input)
                    : await createInvoice(input);
                if (!res.ok) {
                    if (isNamedField(res.field)) {
                        form.setError(res.field, { message: res.error });
                    }
                    return { ok: false, error: res.error, field: res.field };
                }
                return { ok: true, data: { revision: 0, invoice: res.data } };
            },
            onSaved: ({ invoice }) => {
                savedRef.current = invoice;
                setSaved(invoice);
                if (idRef.current === null) {
                    idRef.current = invoice.id;
                    setId(invoice.id);
                    // The draft's own address from now on, keeping how
                    // it is being written (`?mode=paper`, U15).
                    window.history.replaceState(
                        window.history.state,
                        "",
                        `/billing/invoices/${invoice.id}/edit${window.location.search}`,
                    );
                }
            },
        });
        const watching = form.watch(() => autosave.edit(form.getValues()));
        return () => {
            watching.unsubscribe();
            autosave.dispose();
        };
    }, [autosave, form]);

    const flush = useCallback(() => autosave.retry(), [autosave]);
    const keep = useCallback(async () => {
        const ok = await autosave.retry();
        const invoice = savedRef.current;
        if (ok && invoice) return { ok: true as const, invoice };
        return {
            ok: false as const,
            error:
                autosave.snapshot.error ??
                "The draft couldn't be saved. Try again.",
        };
    }, [autosave]);

    return { id, saved, state, settled: isSettled(state), flush, keep };
}

/** The pill beside the title, and whether Try again goes with it. */
export function saveWords(
    state: SaveState,
    hasDraft: boolean,
): { label: string; failed: boolean } | null {
    switch (state.phase) {
        case "saving":
            return { label: "Saving…", failed: false };
        case "failed":
            return { label: "Not saved", failed: true };
        case "dirty":
            return {
                label: hasDraft
                    ? "Draft · changes not saved yet"
                    : "Not saved yet",
                failed: false,
            };
        case "saved":
            return { label: "Draft · saved", failed: false };
        default:
            return hasDraft ? { label: "Draft · saved", failed: false } : null;
    }
}
