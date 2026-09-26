import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { ViewerDate } from "@/components/shared/viewer-date";
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
    tracking,
    orderNote,
}: {
    customer: NonNullable<OrderRead["customer"]>;
    href: string;
    /** Notes that name allergens; null when they could not be read. */
    notes: AllergyNote[] | null;
    /** Delivery orders only. */
    address: string | null;
    tracking: { url: string; courier: string | null } | null;
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
            {tracking ? (
                <div className="mt-2 flex min-w-0 flex-wrap gap-x-1 text-[12.5px]">
                    <span className="text-muted-foreground">Tracking</span>{" "}
                    {tracking.courier ? (
                        <span>{tracking.courier} ·</span>
                    ) : null}
                    <a
                        href={tracking.url}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(
                            FOCUS,
                            "min-w-0 truncate font-mono text-[12px] underline-offset-4 hover:underline",
                        )}
                    >
                        {tracking.url.replace(/^https?:\/\//, "")}
                    </a>
                </div>
            ) : null}
        </Panel>
    );
}
