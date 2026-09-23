import { Button } from "@saroh/ui/button";

import { actionClass, Panel, PanelTitle } from "./parts";

/**
 * "Change this order", under Items where the controls sit by what they
 * change: edit items or address (only before preparing), and refund by line.
 * Only for Owner and Admin — a Member's page has neither (DEC-024), so it is
 * not drawn for them at all rather than drawn disabled.
 */
export function ChangeCard({
    canEdit,
    editable,
    canRefund,
    onEdit,
    onRefund,
}: {
    /** May change orders (`order:write`). */
    canEdit: boolean;
    /** The order is still New (the API says). */
    editable: boolean;
    /** Null when a refund can be started; else why not. */
    canRefund: string | null;
    onEdit: () => void;
    onRefund: () => void;
}) {
    const editNote = !canEdit
        ? "Changing items is for owners and admins."
        : editable
          ? "Items and address can change until preparing starts."
          : "Preparing has started — refund what is wrong and add a new order.";
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
            </div>
            <p className="mt-[7px] text-pretty text-[11.5px] leading-[1.5] text-muted-foreground">
                {editNote}
                {canRefund ? ` ${canRefund}` : ""}
            </p>
        </Panel>
    );
}

/**
 * The order is not paid, so the kitchen is blocked (the API offers no next
 * step). Saroh sends no messages, so this says nothing was sent — and offers
 * the one thing the counter can do: record cash taken for it.
 */
export function PaymentBanner({
    failed,
    first,
    canRecord,
    onCash,
}: {
    failed: boolean;
    first: string;
    canRecord: boolean;
    onCash: () => void;
}) {
    return (
        <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive-subtle-foreground bg-destructive-subtle px-4 py-[13px]"
        >
            <div className="min-w-0 flex-[1_1_260px]">
                <div className="text-[13.5px] font-bold text-destructive-subtle-foreground">
                    {failed ? "Payment didn't go through" : "Not paid yet"}
                </div>
                <p className="mt-[3px] text-pretty text-[12.5px] leading-[1.5] text-neutral-700 dark:text-muted-foreground">
                    {failed
                        ? `Nothing was taken. Don't start it until it's paid. Nothing has been sent to ${first} — ask them to pay again, or take it in cash.`
                        : `It waits for ${first}'s payment. Don't start it until it's paid — or take it in cash at the counter.`}
                </p>
            </div>
            {canRecord ? (
                <Button
                    type="button"
                    className={actionClass("primary")}
                    onClick={onCash}
                >
                    Paid in cash
                </Button>
            ) : null}
        </div>
    );
}
