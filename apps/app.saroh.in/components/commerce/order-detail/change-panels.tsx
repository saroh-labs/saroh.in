import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { useId } from "react";

import { sentenceStart } from "@/lib/format/sentence";
import type { OnlinePaymentWords } from "@/lib/orders/online-payment";
import { uncollectedHeading } from "@/lib/orders/pay-on-handover";

import { actionClass, Panel, PanelTitle } from "./parts";

/**
 * "Change this order", under Items where the controls sit by what they
 * change: edit items or address (only before preparing), refund by line,
 * and — until it is handed over — change how it's fulfilled and cancel as
 * a refund in full (B9). Only for someone who may change or refund orders:
 * a Member's page has none of it (DEC-024), so it is not drawn for them at
 * all rather than drawn disabled. Each button says why when it can't.
 */
export function ChangeCard({
    canEdit,
    editable,
    canRefund,
    fulfilment = undefined,
    cancel = undefined,
    onEdit,
    onRefund,
    onFulfilment,
    onCancel,
    note,
}: {
    /** May change orders (`order:edit`, B16). */
    canEdit: boolean;
    /** The order is still New (the API says). */
    editable: boolean;
    /** Null when a refund can be started; else why not. */
    canRefund: string | null;
    /**
     * "Change how it's fulfilled…": null when it can open, else why not.
     * Undefined (an API before B9): not drawn.
     */
    fulfilment?: string | null;
    /** "Cancel order…": null when it can open, else why not. */
    cancel?: string | null;
    onEdit: () => void;
    onRefund: () => void;
    onFulfilment?: () => void;
    onCancel?: () => void;
    /** What can change on it, where its type says otherwise (a treatment, B14). */
    note?: string;
}) {
    const editNote = !canEdit
        ? "Your role can't change orders."
        : (note ??
          (editable
              ? "Items and address can change until preparing starts. How it's fulfilled can change until it's handed over."
              : fulfilment === null
                ? "Items are locked now that preparing has started. How it's fulfilled can still change until it's handed over."
                : "Preparing has started — refund what is wrong and add a new order."));
    return (
        <Panel aria-labelledby="od-change">
            <PanelTitle id="od-change" className="mb-2.5">
                Change this order
            </PanelTitle>
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    className={actionClass("ghost")}
                    disabled={!canEdit || !editable}
                    title={
                        editable
                            ? "Edit items or address"
                            : "Items are locked once preparing starts"
                    }
                    onClick={onEdit}
                >
                    Edit items or address
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    className={actionClass("ghost")}
                    disabled={canRefund !== null}
                    title={canRefund ?? "Refund by line"}
                    onClick={onRefund}
                >
                    Refund…
                </Button>
                {fulfilment !== undefined ? (
                    <Button
                        type="button"
                        variant="outline"
                        className={actionClass("ghost")}
                        disabled={fulfilment !== null}
                        title={fulfilment ?? undefined}
                        onClick={onFulfilment}
                    >
                        Change how it&apos;s fulfilled…
                    </Button>
                ) : null}
                {cancel !== undefined ? (
                    <Button
                        type="button"
                        variant="outline"
                        className={cn(
                            actionClass("ghost"),
                            cancel === null &&
                                "text-destructive-subtle-foreground hover:text-destructive-subtle-foreground",
                        )}
                        disabled={cancel !== null}
                        title={cancel ?? undefined}
                        onClick={onCancel}
                    >
                        Cancel order…
                    </Button>
                ) : null}
            </div>
            <p className="mt-[7px] text-pretty text-[11.5px] leading-[1.5] text-muted-foreground">
                {editNote}
                {canRefund ? ` ${canRefund}` : ""}
            </p>
        </Panel>
    );
}

/**
 * For someone who moves orders but can't record a payment (UX-010): who
 * to ask, so an unpaid order isn't handed over. Whether they may record a
 * counter payment is their role's permission (`order:edit`), set by the
 * owner or an admin — never its name (DEC-098). Mark paid is shown
 * disabled beside this.
 */
const NO_RECORD =
    "Your role can't record payments — ask the owner or an admin to mark it paid.";

/**
 * The order is not paid, so the kitchen is blocked (the API offers no next
 * step). Saroh sends no messages, so this says nothing was sent — and offers
 * what the counter can do: record cash taken for it, or, when a payment
 * didn't go through, a pay link to copy and send (B11).
 *
 * An order the customer chose to pay at the handover on the website
 * (`handover`) isn't blocked: it is made and brought as usual, and only its
 * handover waits for the money. The banner says so, without alarm, and
 * offers to mark it paid. Once nobody has come for it in three days (R34,
 * `uncollectedDays`), it says how long it has waited and offers to cancel
 * it — which puts its stock back — beside Mark paid; nothing cancels on
 * its own, so keeping it waiting is simply doing neither.
 */
export function PaymentBanner({
    failed,
    first,
    canRecord,
    onCash,
    onSendLink,
    sending = false,
    handover,
    uncollectedDays,
    onCancel,
    online = null,
}: {
    failed: boolean;
    /**
     * Its online payment waiting for the provider or not finished (#122),
     * in words; a failed one keeps this banner's own words.
     */
    online?: Pick<OnlinePaymentWords, "word" | "detail" | "tone"> | null;
    first: string;
    canRecord: boolean;
    onCash: () => void;
    /** Make (or replace) the pay link — only when one can be made. */
    onSendLink?: () => void;
    sending?: boolean;
    /** Paid at the handover: how ("collection" or "delivery"). */
    handover?: "collection" | "delivery";
    /** Days nobody has come for it, from the third on (R34); else none. */
    uncollectedDays?: number | null;
    /** Open "Cancel order…", when this person may cancel it now. */
    onCancel?: () => void;
}) {
    const why = useId();
    const waited = handover
        ? uncollectedHeading(handover, uncollectedDays)
        : null;
    if (handover && !failed && waited) {
        return (
            <div
                role="alert"
                className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive-subtle-foreground bg-destructive-subtle px-4 py-[13px]"
            >
                <div className="min-w-0 flex-[1_1_260px]">
                    <div className="text-[13.5px] font-bold text-destructive-subtle-foreground">
                        {waited}
                    </div>
                    <p
                        id={why}
                        className="mt-[3px] text-pretty text-[12.5px] leading-[1.5] text-foreground"
                    >
                        {handover === "collection"
                            ? `${sentenceStart(first)} chose to pay when they collect it and hasn't come for it.`
                            : `${sentenceStart(first)} chose to pay on delivery and it hasn't been delivered.`}{" "}
                        Cancel it to put the stock back, or keep waiting —
                        nothing cancels on its own.
                        {canRecord ? "" : ` ${NO_RECORD}`}
                    </p>
                </div>
                {canRecord ? (
                    <Button
                        type="button"
                        className={actionClass("primary")}
                        onClick={onCash}
                    >
                        Mark paid
                    </Button>
                ) : (
                    // Shown, disabled, with why (FB-1, DEC-098).
                    <Button
                        type="button"
                        className={actionClass("primary")}
                        disabled
                        aria-describedby={why}
                    >
                        Mark paid
                    </Button>
                )}
                {onCancel ? (
                    <Button
                        type="button"
                        variant="outline"
                        className={cn(
                            actionClass("ghost"),
                            "text-destructive-subtle-foreground hover:text-destructive-subtle-foreground",
                        )}
                        onClick={onCancel}
                    >
                        Cancel order…
                    </Button>
                ) : null}
            </div>
        );
    }
    if (handover && !failed) {
        return (
            <div
                role="status"
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted px-4 py-[13px]"
            >
                <div className="min-w-0 flex-[1_1_260px]">
                    <div className="text-[13.5px] font-bold">
                        {handover === "collection"
                            ? "Pay on collection"
                            : "Pay on delivery"}
                    </div>
                    <p
                        id={why}
                        className="mt-[3px] text-pretty text-[12.5px] leading-[1.5] text-muted-foreground"
                    >
                        {handover === "collection"
                            ? `${sentenceStart(first)} chose to pay when they collect it. Prepare it as usual, take the money at the counter, then mark it paid before marking it collected.`
                            : `${sentenceStart(first)} chose to pay on delivery. Prepare and send it as usual, take the money at the door, then mark it paid before marking it delivered.`}
                        {canRecord ? "" : ` ${NO_RECORD}`}
                    </p>
                </div>
                {canRecord ? (
                    <Button
                        type="button"
                        className={actionClass("primary")}
                        onClick={onCash}
                    >
                        Mark paid
                    </Button>
                ) : (
                    // Shown, disabled, with why (FB-1, DEC-098).
                    <Button
                        type="button"
                        className={actionClass("primary")}
                        disabled
                        aria-describedby={why}
                    >
                        Mark paid
                    </Button>
                )}
            </div>
        );
    }
    // Waiting for the provider, or a payment not finished (#122).
    const pending = !failed && online ? online : null;
    const calm = pending?.tone === "wait";
    const link =
        (failed || pending?.tone === "act") && onSendLink !== undefined;
    return (
        <div
            role={calm ? "status" : "alert"}
            className={cn(
                "flex flex-wrap items-center gap-3 rounded-xl border px-4 py-[13px]",
                calm
                    ? "border-border bg-muted"
                    : "border-destructive-subtle-foreground bg-destructive-subtle",
            )}
        >
            <div className="min-w-0 flex-[1_1_260px]">
                <div
                    className={cn(
                        "text-[13.5px] font-bold",
                        !calm && "text-destructive-subtle-foreground",
                    )}
                >
                    {failed
                        ? "Payment didn't go through"
                        : (pending?.word ?? "Not paid yet")}
                </div>
                <p
                    id={why}
                    className="mt-[3px] text-pretty text-[12.5px] leading-[1.5] text-neutral-700 dark:text-muted-foreground"
                >
                    {failed
                        ? `Nothing was taken. Don't start it until it's paid. Nothing has been sent to ${first} — ${link ? "send them a pay link" : "ask them to pay again"}, or take it in cash.`
                        : pending
                          ? `${pending.detail}${canRecord ? "" : ` ${NO_RECORD}`}`
                          : canRecord
                            ? `It waits for ${first}'s payment. Don't start it until it's paid — or take it in cash at the counter.`
                            : `It waits for ${first}'s payment. Don't start it until it's paid. ${NO_RECORD}`}
                </p>
            </div>
            {link ? (
                <Button
                    type="button"
                    className={actionClass("primary")}
                    disabled={sending}
                    onClick={onSendLink}
                >
                    {sending ? "Making a link…" : "Send a pay link"}
                </Button>
            ) : null}
            {canRecord ? (
                <Button
                    type="button"
                    variant={link ? "outline" : "default"}
                    className={actionClass(link ? "ghost" : "primary")}
                    onClick={onCash}
                >
                    Paid in cash
                </Button>
            ) : (
                // Shown, disabled, with why (FB-1, DEC-098).
                <Button
                    type="button"
                    variant={link ? "outline" : "default"}
                    className={actionClass(link ? "ghost" : "primary")}
                    disabled
                    aria-describedby={why}
                >
                    Paid in cash
                </Button>
            )}
        </div>
    );
}
