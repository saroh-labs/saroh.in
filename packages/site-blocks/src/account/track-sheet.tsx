"use client";

import Link from "next/link";

import { cn } from "../lib/utils";
import type { TrackLookup } from "./order-track";
import { orderLead, OrderTrack, trackProblem } from "./order-track";
import { Sheet, sheetButton } from "./sheet";

/**
 * An order's Track as a sheet over the Orders tab (round-2 plan A, A7;
 * Saroh Customer Site design, the Track sheet): the order's steps and the
 * rest (`order-track.tsx`, which the order's own page draws too), then a
 * way to reach the business.
 */

export type { TrackLookup };

export function TrackSheet({
    track,
    businessName,
    messagesHref,
    onClose,
}: {
    track: TrackLookup | null;
    businessName: string;
    /** The account's Messages, once it exists (A13); null hides the button. */
    messagesHref: string | null;
    onClose: () => void;
}) {
    if (!track) return null;
    if (!track.ok) {
        return (
            <Sheet open onClose={onClose} title="Order">
                <p role="status" className="text-site-body mt-1.5 text-sm">
                    {trackProblem(track.reason)}
                </p>
                <button
                    type="button"
                    onClick={onClose}
                    className={sheetButton(false)}
                >
                    Done
                </button>
            </Sheet>
        );
    }
    const { order } = track;
    return (
        <Sheet
            open
            onClose={onClose}
            title={`Order #${order.number}`}
            lead={orderLead(order)}
        >
            <OrderTrack order={order} canMessage={messagesHref !== null} />
            {messagesHref ? (
                <Link
                    href={messagesHref}
                    className={cn(
                        sheetButton(false),
                        "flex items-center justify-center",
                    )}
                >
                    Message {businessName}
                </Link>
            ) : (
                <button
                    type="button"
                    onClick={onClose}
                    className={sheetButton(false)}
                >
                    Done
                </button>
            )}
        </Sheet>
    );
}
