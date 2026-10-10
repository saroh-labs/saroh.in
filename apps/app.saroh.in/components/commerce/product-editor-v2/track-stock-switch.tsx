"use client";

import { Switch } from "@saroh/ui/switch";
import { showError, showSuccess } from "@saroh/ui/toast";
import { PackageX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
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

    function flip(next: boolean) {
        start(async () => {
            const res = await setProductStockTracking(productId, next);
            if (!res.ok) {
                if (next) showError(res.error);
                // "3 are promised to open orders — fulfil or cancel them
                // first." The API counts every storefront.
                else showError(TRACKING_STILL_ON, res.error);
                return;
            }
            if (next) {
                showSuccess(TRACKING_ON_SAID, TRACKING_ON_NEXT);
            } else {
                onTurnedOff();
                showSuccess(TRACKING_OFF_SAID);
            }
            router.refresh();
        });
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
                onCheckedChange={(on) => (on ? flip(true) : setAsking(true))}
            />
            <ConfirmDialog
                open={asking}
                onOpenChange={setAsking}
                icon={PackageX}
                title={confirm.title}
                description={confirm.description}
                confirmLabel={confirm.confirmLabel}
                onConfirm={() => {
                    setAsking(false);
                    flip(false);
                }}
            />
        </>
    );
}
