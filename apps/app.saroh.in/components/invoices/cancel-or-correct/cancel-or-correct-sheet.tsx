"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Notice } from "@saroh/ui/notice";
import { Skeleton } from "@saroh/ui/skeleton";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import type { InvoiceRef } from "@/components/invoices/details/invoice-actions";
import { RadioCards } from "@/components/shared/fields/choice-group";
import { FormSheet } from "@/components/shared/forms/form-sheet";
import { runAction } from "@/lib/api/run-action";
import { formatMoneyMajor } from "@/lib/format/money";
import {
    creditAndRewriteInvoice,
    creditInvoice,
    readCreditPreview,
    reissueInvoice,
    voidInvoice,
} from "@/lib/invoices/actions";
import type {
    CreditExpect,
    CreditPreview,
    Invoice,
    InvoiceStanding,
} from "@/lib/invoices/service";
import { billedTo } from "@/lib/invoices/status";
import {
    CANCEL_OR_CORRECT,
    PAID_IN_PART_NO_CANCEL,
} from "@/lib/invoices/words";

/**
 * The four ways out of an issued invoice. A GST-registered business never
 * voids one (ADR-008): it cancels by credit note, and may write a correct
 * one in its place. A business that isn't registered voids it, and may
 * write it again.
 */
export type CancelChoice = "credit" | "rewrite" | "void" | "reissue";

/** What the sheet made, for a caller that wants to stay where it is. */
export type CancelOutcome =
    | { kind: "credited"; creditNoteId: string }
    | { kind: "voided" }
    /** A draft with the same lines is open to fix: `rewrite` or `reissue`. */
    | { kind: "draft"; draftId: string };

/** The invoice as the sheet needs it: today's `InvoiceRef`, and its payments. */
export interface CancelOrCorrectInvoice extends InvoiceRef {
    /** Issued, some paid, some left (DEC-173): it can't be cancelled yet. */
    partlyPaid?: boolean;
    /** What has come in so far, as shown: "₹1,000". */
    paidSoFar?: string | null;
    /**
     * What the screen showed, sent with the credit (#2 review): the API
     * refuses "This invoice was just paid. Reload it." when it changed.
     */
    expect?: CreditExpect;
}

/** What the screen shows of an invoice, for the API to check (#2 review). */
export function creditExpectOf(i: {
    standing: InvoiceStanding;
    paidSoFar?: string;
}): CreditExpect | undefined {
    const s = i.standing;
    if (s !== "ISSUED" && s !== "OVERDUE" && s !== "PAID") return undefined;
    return {
        expectStatus: s,
        ...(i.paidSoFar ? { expectPaidSoFar: i.paidSoFar } : {}),
    };
}

/** The sheet's invoice from the API's read: for the details view (U9). */
export function cancelTargetOf(
    i: Pick<Invoice, "id" | "number" | "standing" | "currency" | "total"> &
        Pick<Invoice, "contact" | "billTo"> &
        Partial<Pick<Invoice, "partlyPaid" | "paidSoFar">>,
): CancelOrCorrectInvoice {
    return {
        id: i.id,
        number: i.number,
        standing: i.standing,
        who: billedTo(i).name,
        total: formatMoneyMajor(i.total, i.currency),
        partlyPaid: i.partlyPaid === true,
        paidSoFar:
            i.paidSoFar !== undefined
                ? formatMoneyMajor(i.paidSoFar, i.currency)
                : null,
        expect: creditExpectOf(i),
    };
}

const CHOICES: Record<
    "registered" | "unregistered",
    { value: CancelChoice; label: string; note: (total: string) => string }[]
> = {
    registered: [
        {
            value: "credit",
            label: "Cancel all of it",
            note: (total) =>
                `A credit note for ${total}. Nothing more is owed.`,
        },
        {
            value: "rewrite",
            label: "Cancel and write a correct one",
            note: () =>
                "Credit note now, a new draft with the same lines to fix.",
        },
    ],
    unregistered: [
        {
            value: "void",
            label: "Void it",
            note: () =>
                "It keeps its number and stays in the list, marked void. Nothing more is owed.",
        },
        {
            value: "reissue",
            label: "Void and write again",
            note: () =>
                "Void it now, and a new draft with the same lines opens to fix.",
        },
    ],
};

/**
 * Cancel or correct (DEC-173, INVCancelA and INVCancelAPhone, U13 #1125):
 * one side sheet for every way an unpaid issued invoice is taken back,
 * replacing the Cancel invoice dialog and keeping each of its paths.
 *
 * - **GST-registered:** Cancel all of it (a credit note for the full
 *   amount), or Cancel and write a correct one (the credit note and a draft
 *   with the same lines, made in one step by the API, so a failure leaves
 *   neither). The credit note is shown before it is made: its likely number
 *   and amount, read when the sheet opens.
 * - **Not registered:** Void it, or Void and write again.
 * - **Why** is asked every time, said when the button is pressed with the
 *   keyboard on it, and printed on the credit note (kept on a void one).
 * - **The foot** is "Keep invoice", quiet, then one destructive button
 *   that names what it does ("Issue credit note ₹8,400", "Void invoice").
 *   On a phone the sheet is the screen and the two stack, the button on top.
 * - **A partly paid invoice** isn't cancelled until its payments are
 *   removed (DEC-173): the sheet says so and why, offers what can be done,
 *   and its button is off with the reason. Nothing is promised about later.
 *
 * "Take some off" (a credit note for part) is Phase 2, with the credit note
 * page, and is not offered. A paid invoice's Refund… is its own dialog
 * (`RefundInvoiceDialog`), unchanged.
 *
 * Self-contained, so the details sheet (U9) and the page both open it.
 * With `onDone`, the caller decides what happens after: without it a
 * draft opens in the editor, as Void and write again always did, and
 * anything else refreshes in place.
 */
export function CancelOrCorrectSheet({
    open,
    onOpenChange,
    invoice,
    registered,
    onDone,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: CancelOrCorrectInvoice;
    /** Its paper is a tax invoice: cancelled by credit note, never void. */
    registered: boolean;
    onDone?: (outcome: CancelOutcome) => void;
}) {
    const router = useRouter();
    const ids = { choice: useId(), why: useId() };
    const whyRef = useRef<HTMLInputElement>(null);
    const options = CHOICES[registered ? "registered" : "unregistered"];
    const first = options[0]?.value ?? "credit";
    const [choice, setChoice] = useState<CancelChoice>(first);
    const [reason, setReason] = useState("");
    const [tried, setTried] = useState(false);
    const [busy, setBusy] = useState(false);
    const [preview, setPreview] = useState<
        | { state: "loading" }
        | { state: "ready"; data: CreditPreview }
        | { state: "failed"; error: string }
    >({ state: "loading" });
    const blocked = invoice.partlyPaid === true;
    const number = invoice.number ?? "this invoice";

    // Each opening starts fresh: the first way, no reason, no complaint.
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setChoice(first);
            setReason("");
            setTried(false);
            setPreview({ state: "loading" });
        }
    }

    // The credit note it would issue, read as the sheet opens.
    useEffect(() => {
        if (!open || !registered || blocked) return;
        let live = true;
        void runAction(() => readCreditPreview(invoice.id), {
            quiet: true,
        }).then((res) => {
            if (!live) return;
            if (res?.ok) setPreview({ state: "ready", data: res.data });
            else
                setPreview({
                    state: "failed",
                    error: res?.error ?? "Couldn't load the credit note.",
                });
        });
        return () => {
            live = false;
        };
    }, [open, registered, blocked, invoice.id]);

    const amount =
        preview.state === "ready"
            ? formatMoneyMajor(preview.data.amount, preview.data.currency)
            : invoice.total;
    const byCredit = choice === "credit" || choice === "rewrite";
    const saveLabel = byCredit
        ? `Issue credit note ${amount}`
        : choice === "void"
          ? "Void invoice"
          : "Void and write again";
    const missing = tried && !reason.trim();

    function finish(outcome: CancelOutcome) {
        onOpenChange(false);
        if (onDone) return onDone(outcome);
        if (outcome.kind === "draft") {
            router.push(`/billing/invoices/${outcome.draftId}/edit`);
            return;
        }
        router.refresh();
    }

    async function submit() {
        if (blocked) return;
        setTried(true);
        const why = reason.trim();
        if (!why) {
            whyRef.current?.focus();
            return;
        }
        switch (choice) {
            case "credit": {
                const res = await runAction(
                    () => creditInvoice(invoice.id, why, invoice.expect),
                    { setBusy },
                );
                if (!res) return;
                if (!res.ok) return showError(res.error);
                showSuccess(
                    `${`${number} cancelled with credit note ${res.data.number ?? ""}`.trim()}.`,
                );
                return finish({ kind: "credited", creditNoteId: res.data.id });
            }
            case "rewrite": {
                const res = await runAction(
                    () =>
                        creditAndRewriteInvoice(
                            invoice.id,
                            why,
                            invoice.expect,
                        ),
                    { setBusy },
                );
                if (!res) return;
                if (!res.ok) return showError(res.error);
                showSuccess(
                    `${`${number} cancelled with credit note ${res.data.creditNote.number ?? ""}`.trim()}. A corrected draft is open.`,
                );
                return finish({ kind: "draft", draftId: res.data.draft.id });
            }
            case "void": {
                const res = await runAction(
                    () => voidInvoice(invoice.id, why),
                    { setBusy },
                );
                if (!res) return;
                if (!res.ok) return showError(res.error);
                showSuccess(`${number} voided.`);
                return finish({ kind: "voided" });
            }
            case "reissue": {
                const res = await runAction(
                    () => reissueInvoice(invoice.id, why),
                    { setBusy },
                );
                if (!res) return;
                if (!res.ok) return showError(res.error);
                showSuccess(`${number} voided. A corrected draft is open.`);
                return finish({ kind: "draft", draftId: res.data.id });
            }
        }
    }

    const said = blocked
        ? invoice.paidSoFar
            ? `${invoice.paidSoFar} paid`
            : "partly paid"
        : "not paid";

    return (
        <FormSheet
            open={open}
            title={`${CANCEL_OR_CORRECT} ${invoice.number ?? ""}`.trim()}
            description={`${invoice.total} · ${invoice.who} · ${said}`}
            pending={busy}
            tone="destructive"
            cancelLabel="Keep invoice"
            saveLabel={saveLabel}
            savingLabel={byCredit ? "Issuing the credit note…" : "Voiding…"}
            saveOff={blocked}
            fieldsClassName="gap-4"
            footNote={
                <p className="text-[12.5px] leading-[1.55] text-muted-foreground">
                    {blocked
                        ? PAID_IN_PART_NO_CANCEL
                        : "This cannot be undone."}
                </p>
            }
            onClose={() => onOpenChange(false)}
            onSubmit={submit}
        >
            {blocked ? (
                <Notice tone="warning" title="Part of this invoice is paid">
                    {invoice.paidSoFar
                        ? `${invoice.paidSoFar} of ${invoice.total} has come in.`
                        : "Some money has come in on it."}{" "}
                    Cancelling it would also have to settle that money, handed
                    back or kept, and a cancel here can&apos;t do that. To
                    cancel it, remove its payments first: each one has Remove
                    payment in the invoice&apos;s history. Or keep the invoice
                    and record the rest when it comes in.
                </Notice>
            ) : (
                <>
                    <RadioCards
                        label="How to take it back"
                        options={options.map((o) => ({
                            value: o.value,
                            label: o.label,
                            note: o.note(amount),
                        }))}
                        value={choice}
                        onChange={setChoice}
                        disabled={busy}
                    />
                    <div className="grid gap-1.5">
                        <Label htmlFor={ids.why}>Why</Label>
                        <Input
                            ref={whyRef}
                            id={ids.why}
                            value={reason}
                            maxLength={500}
                            placeholder="Wrong amount, wrong person, returned…"
                            aria-invalid={missing || undefined}
                            aria-describedby={`${ids.why}-help${missing ? ` ${ids.why}-problem` : ""}`}
                            onChange={(e) => setReason(e.target.value)}
                        />
                        {missing ? (
                            <p
                                id={`${ids.why}-problem`}
                                role="alert"
                                className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                            >
                                {byCredit
                                    ? "Say why it is being cancelled."
                                    : "Say why it is being voided."}
                            </p>
                        ) : null}
                        <p
                            id={`${ids.why}-help`}
                            className="text-[12px] text-muted-foreground"
                        >
                            {registered
                                ? "Printed on the credit note. GST-registered: an issued invoice is never deleted, it is cancelled by a credit note."
                                : "Kept on the invoice, for whoever reads it later."}
                        </p>
                    </div>
                    {registered ? (
                        <CreditNotePreview
                            preview={preview}
                            invoice={invoice}
                            amount={amount}
                        />
                    ) : null}
                </>
            )}
        </FormSheet>
    );
}

/** "The credit note": what will be issued, before it is. */
function CreditNotePreview({
    preview,
    invoice,
    amount,
}: {
    preview:
        | { state: "loading" }
        | { state: "ready"; data: CreditPreview }
        | { state: "failed"; error: string };
    invoice: CancelOrCorrectInvoice;
    amount: string;
}) {
    const id = useId();
    return (
        <section aria-labelledby={id} className="grid gap-1.5">
            <h3 id={id} className="label">
                The credit note
            </h3>
            <div
                className="rounded-[10px] border border-border bg-card px-3.5 py-3"
                aria-busy={preview.state === "loading" || undefined}
            >
                <div className="flex min-w-0 items-baseline justify-between gap-3 text-[13.5px] font-semibold">
                    {preview.state === "loading" ? (
                        <Skeleton className="h-4 w-48" />
                    ) : (
                        <span className="min-w-0 truncate">
                            Credit note
                            {preview.state === "ready" ? (
                                <>
                                    {" · "}
                                    <span className="font-mono">
                                        {preview.data.number}
                                    </span>
                                </>
                            ) : null}
                        </span>
                    )}
                    <span className="shrink-0 font-mono tabular-nums">
                        −{amount}
                    </span>
                </div>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                    Against{" "}
                    <span className="font-mono">
                        {invoice.number ?? "this invoice"}
                    </span>{" "}
                    · {invoice.who}
                </p>
                {preview.state === "failed" ? (
                    <p className="mt-1.5 text-[12px] text-muted-foreground">
                        {preview.error} Its number is given when it is issued.
                    </p>
                ) : null}
            </div>
        </section>
    );
}
