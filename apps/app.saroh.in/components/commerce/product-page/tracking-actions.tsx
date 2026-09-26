"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { PackageX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { setProductStockTracking } from "@/lib/products/actions";
import { productEditHref, productHref } from "@/lib/products/links";
import {
    stopTrackingConfirm,
    TRACKING_OFF_SAID,
    TRACKING_ON_NEXT,
    TRACKING_ON_SAID,
    TRACKING_STILL_ON,
} from "@/lib/products/tracking";

/**
 * Track stock from the product page (#515), Owner and Admin only — the page
 * draws these only for them; the API refuses anyone else.
 *
 * "Track stock" needs no confirmation: nothing is lost, and every shelf
 * starts at 0. It goes on to the editor's Stock section, where the count is
 * made. "Stop tracking" asks first: the count goes to 0 and the product
 * sells without a count unless it is marked sold out.
 */
export function StartTrackingButton({
    productId,
    storeId,
    className,
}: {
    productId: string;
    storeId: string;
    className?: string;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();

    function turnOn() {
        start(async () => {
            const res = await setProductStockTracking(productId, true);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            showSuccess(TRACKING_ON_SAID, TRACKING_ON_NEXT);
            router.push(productEditHref(storeId, productId, "stock"));
        });
    }

    return (
        <button
            type="button"
            onClick={turnOn}
            disabled={pending}
            aria-busy={pending}
            className={cn(
                "rounded-sm text-[12px] font-semibold text-brand hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70 coarse:min-h-11",
                className,
            )}
        >
            {pending ? "Turning on…" : "Track stock"}
        </button>
    );
}

export function StopTrackingButton({
    productId,
    productName,
    storeId,
    className,
}: {
    productId: string;
    productName: string;
    storeId: string;
    className?: string;
}) {
    const router = useRouter();
    const [asking, setAsking] = useState(false);
    const [pending, start] = useTransition();
    const confirm = stopTrackingConfirm(productName);

    function turnOff() {
        setAsking(false);
        start(async () => {
            const res = await setProductStockTracking(productId, false);
            if (!res.ok) {
                // "3 are promised to open orders — fulfil or cancel them
                // first." — the API counts every storefront.
                showError(TRACKING_STILL_ON, res.error);
                return;
            }
            showSuccess(TRACKING_OFF_SAID);
            // Untracked, the product has no stock view: back to Overview.
            router.push(productHref(storeId, productId));
        });
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setAsking(true)}
                disabled={pending}
                aria-busy={pending}
                className={cn(
                    "rounded-sm px-1 text-[12px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70 coarse:min-h-11",
                    className,
                )}
            >
                {pending ? "Stopping…" : "Stop tracking"}
            </button>
            <ConfirmDialog
                open={asking}
                onOpenChange={setAsking}
                icon={PackageX}
                title={confirm.title}
                description={confirm.description}
                confirmLabel={confirm.confirmLabel}
                onConfirm={turnOff}
            />
        </>
    );
}
