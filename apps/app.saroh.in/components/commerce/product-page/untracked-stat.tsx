import { Card } from "@saroh/ui/card";
import { cn } from "@saroh/ui/lib/utils";

import type { ProductTracking, SoldOutPlace } from "@/lib/products/tracking";
import {
    BUSINESS_NOT_TRACKING,
    TRACKING_LOCKED,
    untrackedLine,
} from "@/lib/products/tracking";

import { SoldOutActions } from "./sold-out-actions";
import { StartTrackingButton } from "./tracking-actions";

/** What the card says while no storefront has marked it sold out. */
const ALWAYS_AVAILABLE = "Always available on the shop.";

/**
 * The design's untracked card (#515, restyled #522): "Stock · Not tracked ·
 * Always available on the shop." — or "Sold out — marked by hand", naming
 * the storefronts when only some are. Track stock is Owner/Admin's, and
 * only while the business tracks stock; a stock-only role is told why it
 * can't. Marking it sold out is for anyone who may count stock: one button
 * beside Track stock with one storefront, a row per storefront with
 * several. Everyone else sees the state only.
 */
export function UntrackedStat({
    tracking,
    productId,
    storeId,
    places,
    canMark,
}: {
    tracking: ProductTracking;
    productId: string;
    storeId: string;
    places: readonly SoldOutPlace[];
    canMark: boolean;
}) {
    const line = untrackedLine(places);
    const soldOut = places.some((p) => p.soldOut);
    const startTracking = tracking.business && tracking.control === "change";
    const oneButton = canMark && places.length === 1;
    return (
        <Card className="rounded-[12px] px-[15px] py-[13px]">
            <p className="text-[11.5px] text-muted-foreground">Stock</p>
            <p className="mt-1 font-display text-[18px] font-semibold leading-tight">
                Not tracked
            </p>
            <p
                className={cn(
                    "mt-0.5 text-pretty text-[11.5px]",
                    soldOut
                        ? "font-medium text-destructive-subtle-foreground"
                        : "text-muted-foreground",
                )}
            >
                {soldOut ? line : ALWAYS_AVAILABLE}
            </p>
            {!tracking.business ? (
                <p className="mt-2 text-pretty text-[11.5px] text-muted-foreground">
                    {BUSINESS_NOT_TRACKING}
                </p>
            ) : tracking.control === "locked" ? (
                <p className="mt-2 text-pretty text-[11.5px] text-muted-foreground">
                    {TRACKING_LOCKED}
                </p>
            ) : null}
            {startTracking || oneButton ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    {startTracking ? (
                        <StartTrackingButton
                            productId={productId}
                            storeId={storeId}
                        />
                    ) : null}
                    {oneButton ? (
                        <SoldOutActions productId={productId} places={places} />
                    ) : null}
                </div>
            ) : null}
            {canMark && places.length > 1 ? (
                <SoldOutActions
                    productId={productId}
                    places={places}
                    className="mt-2.5 border-t border-border pt-2"
                />
            ) : null}
        </Card>
    );
}
