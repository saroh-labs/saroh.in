"use client";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { MoreHorizontal, PackageX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ConfirmResult } from "@/components/shared/confirm/confirm-dialog";
import { ConfirmDialog } from "@/components/shared/confirm/confirm-dialog";
import { runAction } from "@/lib/api/run-action";
import { setProductStockTracking } from "@/lib/products/actions";
import { productHref } from "@/lib/products/links";
import {
    stopTrackingConfirm,
    TRACKING_OFF_SAID,
    TRACKING_ON_NEXT,
    TRACKING_ON_SAID,
    TRACKING_STILL_ON,
} from "@/lib/products/tracking";
import { STOCK_SHEET_PARAM } from "./sheets/stock-sheet";

/**
 * Track stock from the product page (#515), Owner and Admin only — the page
 * draws these only for them; the API refuses anyone else.
 *
 * "Track stock" needs no confirmation: nothing is lost, and every shelf
 * starts at 0. It stays on the page: the Stock tab, with the stock sheet
 * open on the count. "Stop tracking" sits in the Stock card's ⋯ and asks
 * first: the count goes to 0 and the product sells without a count unless
 * it is marked sold out.
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
            const res = await runAction(() =>
                setProductStockTracking(productId, true),
            );
            if (!res) return;
            if (!res.ok) {
                showError(res.error);
                return;
            }
            showSuccess(TRACKING_ON_SAID, TRACKING_ON_NEXT);
            router.push(
                `${productHref(storeId, productId, "stock")}&${STOCK_SHEET_PARAM}=stock`,
                { scroll: false },
            );
        });
    }

    return (
        <button
            type="button"
            onClick={turnOn}
            disabled={pending}
            aria-busy={pending}
            className={cn(
                "rounded-sm text-[12px] font-semibold text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:text-disabled-foreground coarse:min-h-11",
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
    const confirm = stopTrackingConfirm(productName);

    /** A refusal stays in the confirm, with the reason. */
    async function turnOff(): Promise<ConfirmResult> {
        const res = await setProductStockTracking(productId, false);
        if (!res.ok) {
            // "3 are promised to open orders. Fulfil or cancel them
            // first." The API counts every storefront.
            return { ok: false, error: `${TRACKING_STILL_ON}. ${res.error}` };
        }
        showSuccess(TRACKING_OFF_SAID);
        // Untracked, the product has no stock view: back to Overview.
        router.push(productHref(storeId, productId));
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <IconButton
                        label="More stock actions"
                        icon={<MoreHorizontal />}
                        variant="ghost"
                        size="sm"
                        className={className}
                    />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onSelect={() => setAsking(true)}>
                        <PackageX />
                        Stop tracking…
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
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
