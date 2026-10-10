"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormDialog } from "@/components/shared/form-dialog";
import { useHold } from "@/components/shared/use-hold";
import { cancelBooking } from "@/lib/services/actions";
import type { BookingMoney, CancelPlan } from "@/lib/services/booking-money";
import { cancelledMessage, cancelPlan } from "@/lib/services/booking-money";
import { TextLink } from "@saroh/ui/text-link";

/**
 * Cancel a single booking (S4-003). Calls the `cancelBooking` server action
 * (which frees the slot so it opens back up for other visitors) and
 * refreshes the server-rendered page on success. The api cancel is
 * idempotent, so a double click is harmless.
 *
 * A cancel tells the customer and can't be taken back, so with no money in
 * it nothing is asked: it waits ten seconds with Undo (`useHold`), as the
 * calendar's cancel does, and nothing is written until then.
 *
 * With money paid online for it (E8), it first says what the cancel does
 * with it: refunded before the free-cancel time fixed at booking, if the
 * business's refund policy says so (E30, DEC-058), and kept otherwise.
 * Someone who may refund payments can hand kept money back anyway; anyone
 * else is told who can. That is a choice about money, so it is asked in a
 * dialog and then made at once. Afterwards the toast says what happened,
 * refund refused or still being confirmed included.
 */
export function CancelBookingControl({
    bookingId,
    money,
    freeCancelUntil,
    timezone,
    canRefund = false,
    canReadOrder = false,
}: {
    bookingId: string;
    money?: BookingMoney;
    freeCancelUntil?: string | null;
    timezone?: string;
    /** `payment:manage`: may refund what a late cancel keeps. */
    canRefund?: boolean;
    /** `order:read`: a treatment's visit links to its order (E9). */
    canReadOrder?: boolean;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [plan, setPlan] = useState<CancelPlan | null>(null);
    const { send, pending } = useHold();
    const key = `cancel-booking:${bookingId}`;
    const held = pending.includes(key);

    /** Asked first, in the dialog: made at once, and said. */
    async function cancel(returnCredit: boolean) {
        setBusy(true);
        const res = await cancelBooking(
            bookingId,
            returnCredit ? { returnCredit } : {},
        );
        setBusy(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        setPlan(null);
        const said = cancelledMessage(res.data.money);
        if (said.tone === "error") showError(said.title, said.body);
        else showSuccess(said.title);
        router.refresh();
    }

    /** No money in it: held ten seconds with Undo, nothing asked. */
    function cancelHeld() {
        let sent = "Booking cancelled.";
        send(key, {
            soon: "Cancelling in 10 seconds",
            description: "They're told once it is cancelled.",
            run: async () => {
                const res = await cancelBooking(bookingId, {});
                if (!res.ok) return res;
                const said = cancelledMessage(res.data.money);
                router.refresh();
                if (said.tone === "error") {
                    showError(said.title, said.body);
                    return { ok: false, error: "", said: true };
                }
                sent = said.title;
                return { ok: true };
            },
            sent: () => sent,
            failed: "The booking wasn't cancelled.",
        });
    }

    function onCancel() {
        // Read at the moment it is asked for: the deadline may just have gone.
        const next = cancelPlan({
            money,
            freeCancelUntil,
            timezone: timezone ?? "UTC",
            now: Date.now(),
            canRefund,
        });
        if (next) setPlan(next);
        else cancelHeld();
    }

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCancel}
                disabled={busy || held}
                className="wk-press"
                busy={busy}
                busyLabel="Cancelling…"
            >
                {busy || held ? "Cancelling…" : "Cancel"}
            </Button>
            <FormDialog
                open={plan !== null}
                size="sm"
                title={
                    plan?.treatmentOrderId ? "Cancel visit?" : "Cancel booking?"
                }
                description={
                    <>
                        {plan?.body} This cannot be undone.
                        {plan?.treatmentOrderId && canReadOrder ? (
                            <>
                                {" "}
                                <TextLink
                                    href={`/commerce/orders/${encodeURIComponent(plan.treatmentOrderId)}`}
                                >
                                    Open the order
                                </TextLink>
                            </>
                        ) : null}
                    </>
                }
                pending={busy}
                tone="destructive"
                cancelLabel="Keep booking"
                saveLabel={
                    plan?.treatmentOrderId
                        ? "Cancel visit"
                        : plan?.keeps
                          ? `Cancel, keep the ${plan.what}`
                          : "Cancel booking"
                }
                savingLabel="Cancelling…"
                fieldsClassName="hidden"
                extra={
                    plan?.canOverride ? (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void cancel(true)}
                        >
                            Cancel and refund {plan.amount}
                        </Button>
                    ) : null
                }
                onClose={() => setPlan(null)}
                onSubmit={() => cancel(false)}
            >
                {null}
            </FormDialog>
        </>
    );
}
