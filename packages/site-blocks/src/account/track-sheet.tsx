"use client";

import Link from "next/link";

import { focusRing } from "../booking-flow/styles";
import { cn } from "../lib/utils";
import type { AccountOrderDetail } from "./model";
import { accountDate, stepMark, visitLine } from "./model";
import { Sheet, sheetButton } from "./sheet";

/**
 * An order's Track (round-2 plan A, A7; Saroh Customer Site design, the
 * Track sheet): the steps of the order's own fulfilment type, as the API
 * sends them — ✓ done, ● now, ○ next, each with its line — then the
 * courier's link, a treatment's visits, the receipt, and a way to reach the
 * business. Nothing here decides a step: the API does.
 *
 * A refunded order ends with its refund line; a finished one says it's
 * done. No promise of a text or an SMS: Saroh sends none about orders.
 */

export type TrackLookup =
    | { ok: true; order: AccountOrderDetail }
    | { ok: false; reason: "missing" | "unavailable" };

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
                    {track.reason === "missing"
                        ? "We couldn't find that order in your account."
                        : "This order couldn't be loaded. Refresh the page to try again."}
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
    const items = order.lines
        .map((l) => `${l.quantity} × ${l.name}`)
        .join(", ");
    const lead = [
        order.state === "refunded" ? "Refunded" : null,
        order.fulfilment,
        items,
    ]
        .filter(Boolean)
        .join(" · ");
    const note =
        order.state === "refunded"
            ? "The refund goes back to the way you paid."
            : order.state === "done"
              ? messagesHref
                  ? "All done. Something wrong with it? Send us a message."
                  : "All done."
              : null;
    const courier = order.courier;
    const visits = order.lines.filter((l) => l.visits && l.visits.length > 0);

    return (
        <Sheet
            open
            onClose={onClose}
            title={`Order #${order.number}`}
            lead={lead}
        >
            <ol className="m-0 mt-1 list-none p-0" aria-label="Where it is">
                {order.steps.map((step, i) => (
                    <li
                        key={`${step.label}-${i}`}
                        aria-current={step.state === "now" ? "step" : undefined}
                        className="border-site-border flex items-center gap-2.5 border-t py-2.5 text-sm"
                    >
                        <span
                            className={cn(
                                "min-w-0 flex-1",
                                step.state === "next"
                                    ? "text-site-muted"
                                    : "text-site-fg",
                                step.state === "now" && "font-semibold",
                            )}
                        >
                            <span aria-hidden="true">
                                {stepMark(step.state)}{" "}
                            </span>
                            <span className="sr-only">
                                {step.state === "done"
                                    ? "Done: "
                                    : step.state === "now"
                                      ? "Now: "
                                      : "Next: "}
                            </span>
                            {step.label}
                        </span>
                        <span className="text-site-fg text-right font-semibold tabular-nums">
                            {step.at ? accountDate(step.at) : step.line}
                        </span>
                    </li>
                ))}
            </ol>

            {courier?.trackingUrl ? (
                <a
                    href={courier.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className={cn(
                        "text-site-fg mt-3 inline-block cursor-pointer rounded-sm text-[13.5px] font-semibold underline underline-offset-2 hover:opacity-80 active:opacity-70",
                        focusRing,
                    )}
                >
                    {courier.name
                        ? `Track with ${courier.name}`
                        : "Track with the courier"}
                </a>
            ) : null}

            {visits.map((line) => (
                <div key={line.name} className="mt-3">
                    <div className="text-site-muted mb-1.5 mt-3.5 text-xs font-bold uppercase tracking-[0.08em]">
                        {line.name} · visits
                    </div>
                    <ul className="m-0 list-none p-0">
                        {(line.visits ?? []).map((visit) => {
                            const words = visitLine(visit);
                            return (
                                <li
                                    key={visit.number}
                                    className="border-site-border flex items-center gap-2.5 border-t py-2 text-sm"
                                >
                                    <span className="text-site-fg min-w-0 flex-1">
                                        {words.title}
                                    </span>
                                    <span className="text-site-muted text-[12.5px] font-semibold">
                                        {words.state}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}

            {note ? (
                <p className="text-site-muted mt-2.5 text-[12.5px] leading-normal">
                    {note}
                </p>
            ) : null}

            {order.receipt ? (
                <Link
                    href={`/account/receipts/${encodeURIComponent(order.receipt)}`}
                    className={cn(
                        "text-site-fg mt-3 inline-block cursor-pointer rounded-sm text-[13.5px] font-semibold underline underline-offset-2 hover:opacity-80 active:opacity-70",
                        focusRing,
                    )}
                >
                    See the receipt
                </Link>
            ) : null}

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
