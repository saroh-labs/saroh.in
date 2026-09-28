import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { ViewerDate } from "@/components/shared/viewer-date";
import { cardAttention } from "@/lib/orders/attention";
import type { Shipment } from "@/lib/orders/courier";
import type { AllergyNote, OrderAttention, OrderRead } from "@/lib/orders/read";

import { FOCUS, Panel } from "./parts";

export function initials(name: string): string {
    const letters = name
        .split(/[\s&@.]+/)
        .filter((w) => /^[A-Za-zÀ-ÿ0-9]/.test(w))
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase())
        .join("");
    return letters || "?";
}

/**
 * Who it is for: name (to their page), how long they have ordered here,
 * their Needs attention in red (B15), then how to reach them (with
 * `contact:read`) and — for a delivery only — where it goes, the number it
 * goes to, and how to follow it. A collection order shows no
 * address: the design's audit found a home address on a counter order read
 * as "deliver this".
 */
export function CustomerCard({
    customer,
    href,
    notes,
    attention,
    contact = true,
    address,
    deliveryPhone = null,
    shipment,
    onChangeTracking,
    orderNote,
}: {
    customer: NonNullable<OrderRead["customer"]>;
    href: string;
    /**
     * Notes that name allergens; null when they could not be read. Drawn
     * only from an API before B15, which sends no `attention`.
     */
    notes: AllergyNote[] | null;
    /** Their Needs attention, as the API let this viewer see it (B15). */
    attention?: OrderAttention | null;
    /**
     * The viewer reads contacts: their own phone and email. Without it the
     * API sends neither (review #19), so "No phone" would be untrue.
     */
    contact?: boolean;
    /** Delivery orders only. */
    address: string | null;
    /**
     * The number the order is delivered to (delivery orders only): the
     * order's own, which whoever works it sees.
     */
    deliveryPhone?: string | null;
    /** Who took it and how to follow it, once it's with a courier (B10). */
    shipment: Shipment | null;
    /** Opens the panel to add or correct them. */
    onChangeTracking: () => void;
    /** What the customer wrote with the order. */
    orderNote: string | null;
}) {
    const name = customer.name ?? customer.email ?? "Customer";
    return (
        <Panel aria-label="Customer">
            <div className="flex items-center gap-2.5">
                <span
                    aria-hidden
                    className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-bold"
                >
                    {initials(name)}
                </span>
                <div className="min-w-0">
                    <Link
                        href={href}
                        className={cn(
                            FOCUS,
                            "break-words text-[14px] font-semibold text-foreground underline-offset-4 hover:underline",
                        )}
                    >
                        {name}
                    </Link>
                    <div className="text-[12px] text-muted-foreground">
                        {customer.orderCount > 1 && customer.firstOrderAt ? (
                            <>
                                {customer.orderCount} orders since{" "}
                                <ViewerDate
                                    iso={customer.firstOrderAt}
                                    variant="monthYear"
                                />
                            </>
                        ) : (
                            "First order"
                        )}
                    </div>
                </div>
            </div>
            {attention !== undefined ? (
                <AttentionBlock attention={attention} />
            ) : notes && notes.length > 0 ? (
                <div className="mt-2.5 rounded-lg bg-destructive-subtle px-2.5 py-2 text-[12.5px] font-semibold leading-[1.45] text-destructive-subtle-foreground">
                    {notes.map((n) => n.body).join(" · ")}
                </div>
            ) : null}
            <div className="mt-2.5 flex flex-col gap-[3px] text-[12.5px] text-neutral-700 dark:text-muted-foreground">
                {customer.email ? (
                    <span className="break-all">{customer.email}</span>
                ) : null}
                {contact ? <span>{customer.phone ?? "No phone"}</span> : null}
                {address ? (
                    <span className="whitespace-pre-line text-muted-foreground">
                        {address}
                    </span>
                ) : null}
                {deliveryPhone && deliveryPhone !== customer.phone ? (
                    <span>
                        <span className="text-muted-foreground">
                            Delivery phone{" "}
                        </span>
                        <a
                            href={`tel:${deliveryPhone.replace(/[^\d+]/g, "")}`}
                            className={cn(
                                FOCUS,
                                "rounded-sm text-foreground underline-offset-4 hover:underline active:opacity-80",
                            )}
                        >
                            {deliveryPhone}
                        </a>
                    </span>
                ) : null}
            </div>
            {orderNote ? (
                <p className="mt-2 text-pretty text-[12.5px] leading-[1.5]">
                    <span className="text-muted-foreground">Note</span> “
                    {orderNote}”
                </p>
            ) : null}
            {shipment ? (
                <TrackingRow shipment={shipment} onChange={onChangeTracking} />
            ) : null}
        </Panel>
    );
}

/**
 * The customer's Needs attention (B15), in the design's red box: each entry
 * as "Allergy: Sesame", with its detail and where it came from ("from the
 * booking page") on hover and to a screen reader. A sensitive entry reaches
 * only a role that may read it, and never the printed ticket. What this
 * viewer can't see is counted, never shown; a failed read says so.
 */
function AttentionBlock({ attention }: { attention: OrderAttention | null }) {
    if (attention === null) {
        return (
            <div
                role="status"
                className="mt-2.5 rounded-lg bg-muted px-2.5 py-2 text-[12.5px] leading-[1.45] text-muted-foreground"
            >
                <span className="font-semibold text-foreground">
                    Needs attention: not available.
                </span>{" "}
                Check with them before it goes out.
            </div>
        );
    }
    const card = cardAttention(attention);
    if (card.entries.length === 0 && !card.hidden) return null;
    return (
        <div className="mt-2.5">
            {card.entries.length > 0 ? (
                <ul
                    aria-label="Needs attention"
                    className="flex flex-wrap gap-x-1 rounded-lg bg-destructive-subtle px-2.5 py-2 text-[12.5px] font-semibold leading-[1.45] text-destructive-subtle-foreground"
                >
                    {card.entries.map((e, i) => (
                        <li
                            key={e.id}
                            title={e.title}
                            className={cn(e.sensitive && "print:hidden")}
                        >
                            {i > 0 ? (
                                <span aria-hidden className="pr-1">
                                    ·
                                </span>
                            ) : null}
                            {e.text}
                            {e.title !== e.text ? (
                                <span className="sr-only">
                                    {`, ${e.title}`}
                                </span>
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : null}
            {card.hidden ? (
                <p className="mt-1 text-[11.5px] text-muted-foreground print:hidden">
                    {card.hidden}
                </p>
            ) : null}
        </div>
    );
}

/**
 * "Tracking  Delhivery · 1487 2290 3314", the number opening the courier's
 * link when there is one; "No tracking number yet · Add" until it is typed.
 * Our own driver has no number to wait for.
 */
export function TrackingRow({
    shipment,
    onChange,
}: {
    shipment: Shipment;
    onChange: () => void;
}) {
    const { courier, number, url, ownDriver, canChange } = shipment;
    const shown = number ?? (url ? url.replace(/^https?:\/\//, "") : null);
    const action = (label: string, name: string) => (
        <button
            type="button"
            onClick={onChange}
            aria-label={name}
            className={cn(
                FOCUS,
                "rounded-sm font-sans text-[12.5px] font-semibold text-foreground underline underline-offset-4 coarse:min-h-11",
            )}
        >
            {label}
        </button>
    );
    return (
        <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-1 text-[12.5px]">
            <span className="text-muted-foreground">Tracking</span>{" "}
            {courier ? (
                <span className="font-mono text-[12px]">
                    {courier}
                    {shown ? " ·" : ""}
                </span>
            ) : null}
            {shown && url ? (
                <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                        FOCUS,
                        "min-w-0 truncate font-mono text-[12px] underline underline-offset-4",
                    )}
                >
                    {shown}
                </a>
            ) : shown ? (
                <span className="min-w-0 break-all font-mono text-[12px]">
                    {shown}
                </span>
            ) : null}
            {!number && !ownDriver ? (
                <span className="text-muted-foreground">
                    {courier || url ? "· " : ""}No tracking number yet
                    {canChange ? " · " : ""}
                </span>
            ) : null}
            {canChange
                ? !number && !ownDriver
                    ? action("Add", "Add the tracking number")
                    : action("Change", "Change the courier or tracking number")
                : null}
        </div>
    );
}
