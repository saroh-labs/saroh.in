"use client";

import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { formatShortDate } from "@/lib/format/datetime";
import { confirmCheckoutAction } from "@/lib/saroh-billing/billing-actions";
import type { ConfirmResult } from "@/lib/saroh-billing/plan-view";

/** How a confirm is going: asking, still waiting for Razorpay, or settled. */
export type ConfirmPhase = "idle" | "checking" | "waiting" | "settled";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Asking the API whether the waiting checkout is paid (DEC-093, UX-003),
 * a few times a couple of seconds apart, and saying the outcome once: on
 * the plan now, starting on a date, or declined. Still waiting after the
 * last try is said on the page, never as a reason to pay again.
 */
export function useCheckoutConfirm(planName: string) {
    const router = useRouter();
    const [phase, setPhase] = useState<ConfirmPhase>("idle");
    const busy = useRef(false);

    const confirm = useCallback(
        async (tries = 1, gapMs = 2500): Promise<ConfirmResult["state"]> => {
            if (busy.current) return "waiting";
            busy.current = true;
            setPhase("checking");
            try {
                for (let i = 0; i < tries; i += 1) {
                    const res = await confirmCheckoutAction();
                    const state = res.ok ? res.data.state : "waiting";
                    if (state !== "waiting") {
                        setPhase("settled");
                        const name = res.ok
                            ? (res.data.plan?.name ?? planName)
                            : planName;
                        if (state === "completed") {
                            showSuccess(`You're on ${name} now.`);
                        } else if (state === "scheduled" && res.ok) {
                            const zone =
                                Intl.DateTimeFormat().resolvedOptions()
                                    .timeZone;
                            showSuccess(
                                res.data.startAt
                                    ? `${name} starts on ${formatShortDate(res.data.startAt, zone)}, as you authorised.`
                                    : `${name} is set up, as you authorised.`,
                            );
                        } else if (state === "failed") {
                            showError(
                                `The payment for ${name} didn't go through, so nothing changed.`,
                                "Choose the plan again to try once more.",
                            );
                        }
                        router.refresh();
                        return state;
                    }
                    if (i < tries - 1) await wait(gapMs);
                }
                setPhase("waiting");
                return "waiting";
            } finally {
                busy.current = false;
            }
        },
        [planName, router],
    );

    return { phase, confirm };
}
