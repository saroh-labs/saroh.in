import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { ViewerDate } from "@/components/shared/viewer-date";
import type { Shipment } from "@/lib/orders/courier";
import type { AllergyNote, OrderRead } from "@/lib/orders/read";

import { FOCUS, Panel } from "./parts";

function initials(name: string): string {
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
 * their allergy note in red, then how to reach them and — for a delivery
 * only — where it goes and how to follow it. A collection order shows no
 * address: the design's audit found a home address on a counter order read
 * as "deliver this".
 */
export function CustomerCard({
    customer,
    href,
    notes,
    address,
    shipment,
    onChangeTracking,
    orderNote,
}: {
    customer: NonNullable<OrderRead["customer"]>;
    href: string;
    /** Notes that name allergens; null when they could not be read. */
    notes: AllergyNote[] | null;
    /** Delivery orders only. */
    address: string | null;
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
            {notes && notes.length > 0 ? (
                <div className="mt-2.5 rounded-lg bg-destructive-subtle px-2.5 py-2 text-[12.5px] font-semibold leading-[1.45] text-destructive-subtle-foreground">
                    {notes.map((n) => n.body).join(" · ")}
                </div>
            ) : null}
            <div className="mt-2.5 flex flex-col gap-[3px] text-[12.5px] text-neutral-700 dark:text-muted-foreground">
                {customer.email ? (
                    <span className="break-all">{customer.email}</span>
                ) : null}
                <span>{customer.phone ?? "No phone"}</span>
                {address ? (
                    <span className="whitespace-pre-line text-muted-foreground">
                        {address}
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
 * "Tracking  Delhivery · 1487 2290 3314", the number opening the courier's
 * link when there is one; "No tracking number yet · Add" until it is typed.
 * Our own driver has no number to wait for.
 */
function TrackingRow({
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
