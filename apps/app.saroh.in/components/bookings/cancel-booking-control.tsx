"use client";

import { Button } from "@saroh/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { cancelBooking } from "@/lib/services/actions";

/**
 * Cancel a single booking from the owner calendar (S4-003). Calls the
 * `cancelBooking` server action (which frees the slot so it opens back up for
 * other visitors) and refreshes the server-rendered list on success. The api
 * cancel is idempotent, so a double click is harmless.
 */
export function CancelBookingControl({ bookingId }: { bookingId: string }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    async function onCancel() {
        setBusy(true);
        const res = await cancelBooking(bookingId);
        setBusy(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Booking cancelled");
        router.refresh();
    }

    return (
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
    );
}
