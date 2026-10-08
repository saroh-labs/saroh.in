"use client";

import { Button } from "@saroh/ui/button";
import { showError } from "@saroh/ui/toast";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { ViewerDate } from "@/components/shared/viewer-date";
import type { PendingCheckout } from "@/lib/saroh-billing/plan-view";
import { openRazorpayWindow } from "@/lib/saroh-billing/razorpay-window";

import { useCheckoutConfirm } from "./use-checkout-confirm";

/**
 * A plan change waiting for its payment, on "Your plan" (DEC-093, UX-003).
 * Arriving here — back from Razorpay by hand, or after the window closed —
 * checks once with Razorpay through the API, so a payment the webhook
 * hasn't brought yet still moves the plan. It never offers to start again
 * (a second mandate): "Continue payment" reopens the same one.
 */
export function CheckoutPending({ pending }: { pending: PendingCheckout }) {
    const { phase, confirm } = useCheckoutConfirm(pending.planName);
    const [opening, setOpening] = useState(false);

    useEffect(() => {
        void confirm(1);
        // Once per arrival; the buttons ask again.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function resume() {
        if (!pending.handoff) return;
        setOpening(true);
        const outcome = await openRazorpayWindow(
            pending.handoff,
            pending.planName,
        );
        setOpening(false);
        if (outcome === "paid") await confirm(8);
        else if (outcome === "unavailable") {
            showError(
                "Razorpay's payment window couldn't open.",
                "Nothing was charged. Check your connection and try again.",
            );
        }
    }

    const checking = phase === "checking" || phase === "idle";
    return (
        <div
            role="status"
            aria-live="polite"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/70 bg-warning-subtle px-[18px] py-3 text-[13px] text-warning-subtle-foreground"
        >
            <p className="flex min-w-0 flex-[1_1_260px] items-start gap-2 text-pretty font-medium">
                {checking ? (
                    <LoaderCircle
                        aria-hidden
                        className="mt-px size-4 shrink-0 animate-spin motion-reduce:animate-none"
                    />
                ) : (
                    <CircleAlert
                        aria-hidden
                        className="mt-px size-4 shrink-0"
                    />
                )}
                {checking ? (
                    <span>
                        Checking your payment for {pending.planName} with
                        Razorpay…
                    </span>
                ) : (
                    <span>
                        Your move to {pending.planName} is waiting for its
                        payment. If you&apos;ve just paid, it can take a minute
                        to reach us, and you don&apos;t need to pay again. It
                        lapses on <ViewerDate iso={pending.expiresAt} />.
                    </span>
                )}
            </p>
            {checking ? null : (
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void confirm(3)}
                    >
                        Check again
                    </Button>
                    {pending.handoff ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={opening}
                            onClick={() => void resume()}
                        >
                            {opening ? "Opening…" : "Continue payment"}
                        </Button>
                    ) : null}
                </div>
            )}
        </div>
    );
}
