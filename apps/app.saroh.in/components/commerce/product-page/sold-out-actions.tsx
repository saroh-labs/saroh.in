"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setProductSoldOut } from "@/lib/products/actions";
import type { SoldOutPlace } from "@/lib/products/tracking";
import {
    soldOutAction,
    soldOutFailed,
    soldOutSaid,
} from "@/lib/products/tracking";

const actionClass =
    "rounded-sm text-[12px] font-semibold text-brand hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70 coarse:min-h-11";

/**
 * Mark an untracked product sold out by hand, or available again (#515),
 * per storefront. Drawn only for someone who may count and move stock; the
 * API refuses anyone else. No confirmation: it is undone the same way, and
 * open orders keep what they have.
 *
 * One storefront: a single text button. Several: a row for each — its name,
 * whether it sells there now, and its own button — so marking one never
 * guesses which.
 */
export function SoldOutActions({
    productId,
    places,
    className,
}: {
    productId: string;
    places: readonly SoldOutPlace[];
    className?: string;
}) {
    if (places.length === 0) return null;
    if (places.length === 1) {
        return (
            <SoldOutButton
                productId={productId}
                place={places[0]}
                className={className}
            />
        );
    }
    return (
        <ul
            aria-label="Sold out by storefront"
            className={cn("flex flex-col gap-1", className)}
        >
            {places.map((place) => (
                <li
                    key={place.storefrontId}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[12px]"
                >
                    <span className="min-w-0">
                        <span className="font-medium text-foreground">
                            {place.name}
                        </span>{" "}
                        <span
                            className={
                                place.soldOut
                                    ? "text-destructive-subtle-foreground"
                                    : "text-muted-foreground"
                            }
                        >
                            · {place.soldOut ? "Sold out" : "Available"}
                        </span>
                    </span>
                    <SoldOutButton
                        productId={productId}
                        place={place}
                        label={`${soldOutAction(place.soldOut)} at ${place.name}`}
                    />
                </li>
            ))}
        </ul>
    );
}

function SoldOutButton({
    productId,
    place,
    label,
    className,
}: {
    productId: string;
    place: SoldOutPlace;
    /** The accessible name when the row already says where. */
    label?: string;
    className?: string;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const next = !place.soldOut;

    function toggle() {
        start(async () => {
            const res = await setProductSoldOut(
                productId,
                place.storefrontId,
                next,
            );
            if (!res.ok) {
                showError(soldOutFailed(next), res.error);
                return;
            }
            showSuccess(soldOutSaid(res.data.name || place.name, next));
            router.refresh();
        });
    }

    return (
        <button
            type="button"
            onClick={toggle}
            disabled={pending}
            aria-busy={pending}
            aria-label={label}
            className={cn(actionClass, className)}
        >
            {pending ? "Saving…" : soldOutAction(place.soldOut)}
        </button>
    );
}
