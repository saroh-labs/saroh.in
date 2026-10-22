import Link from "next/link";

import { cn } from "../lib/utils";
import type { AccountOrderDetail } from "./model";
import { accountDate, stepMark, visitLine } from "./model";
import { textLink } from "./parts";

/**
 * An order's Track, as its sheet and its own page both draw it (round-2
 * plan A, A7; DEC-142): the steps of the order's own fulfilment type, as
 * the API sends them — ✓ done, ● now, ○ next, each with its line — then a
 * pick-up's place, the courier's link, a treatment's visits, and the
 * receipt. Nothing here decides a step: the API does.
 *
 * A refunded order ends with its refund line; a finished one says it's
 * done. No promise of a text or an SMS: Saroh sends none about orders.
 *
 * A plain module, so the order's page draws it on the server and the sheet
 * in the browser.
 */

export type TrackLookup =
    | { ok: true; order: AccountOrderDetail }
    | { ok: false; reason: "missing" | "unavailable" };

/** What a lookup that found nothing says, in the sheet and on the page. */
export function trackProblem(reason: "missing" | "unavailable"): string {
    return reason === "missing"
        ? "We couldn't find that order in your account."
        : "This order couldn't be loaded. Refresh the page to try again.";
}

/** "Refunded · Pick-up · 2 × Sourdough, 1 × Rye". */
export function orderLead(order: AccountOrderDetail): string {
    const items = order.lines
        .map((l) => `${l.quantity} × ${l.name}`)
        .join(", ");
    return [
        order.state === "refunded" ? "Refunded" : null,
        order.fulfilment,
        items,
    ]
        .filter(Boolean)
        .join(" · ");
}

export function OrderTrack({
    order,
    canMessage,
}: {
    order: AccountOrderDetail;
    /** The account has Messages (A13): a finished order says how to reach them. */
    canMessage: boolean;
}) {
    const note =
        order.state === "refunded"
            ? "The refund goes back to the way you paid."
            : order.state === "done"
              ? canMessage
                  ? "All done. Something wrong with it? Send us a message."
                  : "All done."
              : null;
    const courier = order.courier;
    const visits = order.lines.filter((l) => l.visits && l.visits.length > 0);
    const now = new Date();

    return (
        <>
            <ol className="m-0 mt-1 list-none p-0" aria-label="Where it is">
                {order.steps.map((step, i) => (
                    <li
                        key={`${step.label}-${i}`}
                        aria-current={step.state === "now" ? "step" : undefined}
                        className="border-site-border flex items-center gap-2.5 border-t py-2.5 text-[15px]"
                    >
                        <span
                            className={cn(
                                "min-w-0 flex-1",
                                step.state === "next"
                                    ? "text-site-body"
                                    : "text-site-fg",
                                step.state === "now" && "font-semibold",
                            )}
                        >
                            <span
                                aria-hidden="true"
                                className={
                                    step.state === "now"
                                        ? "text-site-accent-text"
                                        : undefined
                                }
                            >
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

            {order.collectFrom && order.state === "open" ? (
                <p className="text-site-body mt-3 text-[14px] leading-normal">
                    <span className="text-site-fg font-semibold">
                        Pick-up from
                    </span>{" "}
                    {order.collectFrom.address}
                    {order.collectFrom.hours ? (
                        <span className="text-site-body block text-[13.5px]">
                            Open {order.collectFrom.hours}
                        </span>
                    ) : null}
                </p>
            ) : null}

            {courier?.trackingUrl ? (
                <a
                    href={courier.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className={cn(
                        textLink,
                        "mt-3 inline-block text-[14px] font-semibold",
                    )}
                >
                    {courier.name
                        ? `Track with ${courier.name}`
                        : "Track with the courier"}
                </a>
            ) : null}

            {visits.map((line) => (
                <div key={line.name} className="mt-3">
                    <div className="text-site-body mb-1.5 mt-3.5 text-xs font-bold uppercase tracking-[0.08em]">
                        {line.name} · visits
                    </div>
                    <ul className="m-0 list-none p-0">
                        {(line.visits ?? []).map((visit) => {
                            const words = visitLine(visit, now);
                            return (
                                <li
                                    key={visit.number}
                                    className="border-site-border flex items-center gap-2.5 border-t py-2 text-[15px]"
                                >
                                    <span className="text-site-fg min-w-0 flex-1">
                                        {words.title}
                                    </span>
                                    {words.state ? (
                                        <span className="text-site-body text-[13px] font-semibold">
                                            {words.state}
                                        </span>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}

            {note ? (
                <p className="text-site-body mt-2.5 text-[13.5px] leading-normal">
                    {note}
                </p>
            ) : null}

            {order.receipt ? (
                <Link
                    href={`/account/receipts/${encodeURIComponent(order.receipt)}`}
                    className={cn(
                        textLink,
                        "mt-3 inline-block text-[14px] font-semibold",
                    )}
                >
                    See the receipt
                </Link>
            ) : null}
        </>
    );
}
