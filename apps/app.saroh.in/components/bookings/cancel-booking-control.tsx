"use client";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@saroh/ui/alert-dialog";
import { Button, buttonVariants } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { cancelBooking } from "@/lib/services/actions";
import type { BookingMoney, CancelPlan } from "@/lib/services/booking-money";
import { cancelledMessage, cancelPlan } from "@/lib/services/booking-money";

/**
 * Cancel a single booking (S4-003). Calls the `cancelBooking` server action
 * (which frees the slot so it opens back up for other visitors) and
 * refreshes the server-rendered page on success. The api cancel is
 * idempotent, so a double click is harmless.
 *
 * With money paid online for it (E8), it first says what the cancel does
 * with it: refunded before the free-cancel time fixed at booking, if the
 * business's refund policy says so (E30, DEC-058), and kept otherwise.
 * Someone who may refund payments can hand kept money back anyway; anyone
 * else is told who can. Afterwards the toast says what
 * happened, refund refused or still being confirmed included.
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

    async function cancel(returnCredit: boolean) {
        setPlan(null);
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
        const said = cancelledMessage(res.data.money);
        if (said.tone === "error") showError(said.title, said.body);
        else showSuccess(said.title);
        router.refresh();
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
        else void cancel(false);
    }

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCancel}
                disabled={busy}
                className="wk-press"
            >
                {busy ? "Cancelling…" : "Cancel"}
            </Button>
            <AlertDialog
                open={plan !== null}
                onOpenChange={(open) => {
                    if (!open) setPlan(null);
                }}
            >
                <AlertDialogContent className="max-w-[420px] gap-0 overflow-hidden p-0 sm:rounded-xl">
                    <AlertDialogHeader className="space-y-0 px-[22px] pb-1.5 pt-5 text-left">
                        <AlertDialogTitle className="mb-1.5 font-display text-[17px] font-semibold tracking-[-0.02em]">
                            Cancel this booking?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-[13px] leading-[1.55] text-muted-foreground">
                            {plan?.body}
                            {plan?.treatmentOrderId && canReadOrder ? (
                                <>
                                    {" "}
                                    <Link
                                        href={`/commerce/orders/${encodeURIComponent(plan.treatmentOrderId)}`}
                                        className="cursor-pointer font-medium text-foreground underline underline-offset-4 hover:text-foreground/80 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-foreground/70"
                                    >
                                        Open the order
                                    </Link>
                                </>
                            ) : null}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-wrap gap-2 px-[22px] py-[18px] sm:space-x-0">
                        <AlertDialogCancel className="mt-0">
                            Keep booking
                        </AlertDialogCancel>
                        {plan?.canOverride ? (
                            <AlertDialogAction
                                className={buttonVariants({
                                    variant: "outline",
                                })}
                                onClick={() => void cancel(true)}
                            >
                                Cancel and refund {plan.amount}
                            </AlertDialogAction>
                        ) : null}
                        <AlertDialogAction
                            className={buttonVariants({
                                variant: "destructive",
                            })}
                            onClick={() => void cancel(false)}
                        >
                            {plan?.treatmentOrderId
                                ? "Cancel visit"
                                : plan?.keeps
                                  ? `Cancel, keep the ${plan.what}`
                                  : "Cancel booking"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
