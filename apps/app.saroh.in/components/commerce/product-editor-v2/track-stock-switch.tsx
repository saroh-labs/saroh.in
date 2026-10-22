"use client";

import { Switch } from "@saroh/ui/switch";
import { showError, showSuccess } from "@saroh/ui/toast";
import { PackageX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ConfirmResult } from "@/components/shared/confirm/confirm-dialog";
import { ConfirmDialog } from "@/components/shared/confirm/confirm-dialog";
import { runAction } from "@/lib/api/run-action";
import { setProductStockTracking } from "@/lib/products/actions";
import type { TrackingControl } from "@/lib/products/tracking";
import {
    stopTrackingConfirm,
    TRACKING_OFF_SAID,
    TRACKING_ON_NEXT,
    TRACKING_ON_SAID,
    TRACKING_STILL_ON,
} from "@/lib/products/tracking";

/**
 * The Stock section's Track stock switch (#515), after the Editor design:
 * a 36×22 track at the heading's end. Owner and Admin flip it; a stock-only
 * role sees it locked (a deliberate difference from the design, which lets
 * them) and the section says why. Off asks first — the count goes to 0 —
 * and on needs no asking: every shelf starts at 0, ready to count.
 */
export function TrackStockSwitch({
    productId,
    productName,
    tracked,
    control,
    onTurnedOff,
}: {
    productId: string;
    productName: string;
    tracked: boolean;
    control: Exclude<TrackingControl, "hidden">;
    /**
     * Closes an Add stock the section had open: there is nothing left to
     * count. Its counts reset from the refreshed product, not from here.
     */
    onTurnedOff: () => void;
}) {
    const router = useRouter();
    const [asking, setAsking] = useState(false);
    const [pending, start] = useTransition();
    const locked = control === "locked";
    const confirm = stopTrackingConfirm(productName);

    function turnOn() {
        start(async () => {
            const res = await runAction(() =>
                setProductStockTracking(productId, true),
            );
            if (!res) return;
            if (!res.ok) {
                showError(res.error);
                return;
            }
            showSuccess(TRACKING_ON_SAID, TRACKING_ON_NEXT);
            router.refresh();
        });
    }

    /** Asked first; a refusal stays in the confirm, with the reason. */
    async function turnOff(): Promise<ConfirmResult> {
        const res = await setProductStockTracking(productId, false);
        if (!res.ok) {
            // "3 are promised to open orders. Fulfil or cancel them
            // first." The API counts every storefront.
            return { ok: false, error: `${TRACKING_STILL_ON}. ${res.error}` };
        }
        onTurnedOff();
        showSuccess(TRACKING_OFF_SAID);
        router.refresh();
    }

    return (
        <>
            <span className="text-[12.5px] text-foreground/75">
                Track stock
            </span>
            <Switch
                size="sm"
                checked={tracked}
                aria-label="Track stock for this product"
                aria-busy={pending}
                disabled={locked || pending}
                onCheckedChange={(on) => (on ? turnOn() : setAsking(true))}
            />
            <ConfirmDialog
                open={asking}
                onOpenChange={setAsking}
                icon={PackageX}
                title={confirm.title}
                description={confirm.description}
                confirmLabel={confirm.confirmLabel}
                keepLabel={confirm.keepLabel}
                onConfirm={turnOff}
            />
        </>
    );
}
