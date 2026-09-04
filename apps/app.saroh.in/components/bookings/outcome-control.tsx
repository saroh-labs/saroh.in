"use client";

import { Button } from "@saroh/ui/button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { recordBookingOutcome } from "@/lib/services/actions";
import type { BookingOutcome } from "@/lib/services/service";

/**
 * How the appointment went (#241).
 *
 * Two buttons, no dropdown and no confirmation: a merchant marking up a day's
 * appointments does it several times in a row, and every extra tap is one they
 * pay for on every booking. It is correctable, which is what makes that safe —
 * pressing the wrong one is a click to undo, not a support request.
 *
 * Deliberately NOT derived from the clock. A slot that has elapsed is evidence
 * that time passed, not that anyone attended, and the api refuses to record an
 * outcome for an appointment that has not ended.
 */
export function OutcomeControl({
    bookingId,
    outcome,
}: {
    bookingId: string;
    outcome: BookingOutcome | null;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    const record = (next: BookingOutcome) => {
        startTransition(async () => {
            const res = await recordBookingOutcome(bookingId, next);
            if (!res.ok) {
                toast.error(res.error);
                return;
            }
            toast.success(
                next === "ATTENDED"
                    ? "Marked as attended"
                    : "Marked as a no-show",
            );
            router.refresh();
        });
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Button
                type="button"
                size="sm"
                variant={outcome === "ATTENDED" ? "default" : "outline"}
                className="wk-press"
                disabled={pending}
                onClick={() => record("ATTENDED")}
            >
                They came
            </Button>
            <Button
                type="button"
                size="sm"
                variant={outcome === "NO_SHOW" ? "default" : "outline"}
                className="wk-press"
                disabled={pending}
                onClick={() => record("NO_SHOW")}
            >
                They didn&rsquo;t
            </Button>
        </div>
    );
}
