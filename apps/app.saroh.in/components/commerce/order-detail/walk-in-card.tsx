import { cn } from "@saroh/ui/lib/utils";

import type { Shipment } from "@/lib/orders/courier";
import type { OrderRead } from "@/lib/orders/read";

import { initials, TrackingRow } from "./customer-card";
import { FOCUS, Panel } from "./parts";

/**
 * The customer column of an order with no customer record. A walk-in
 * (B13) shows "Walk-in · ‹name›" and their phone, as a `tel:` link, to a
 * viewer who reads contacts; a walk-in has no Needs attention and no page
 * to open. An order whose customer record is gone says so.
 */
export function NoCustomerCard({
    walkIn,
    contact,
    address,
    shipment,
    onChangeTracking,
    orderNote,
}: {
    walkIn: OrderRead["walkIn"];
    /** The viewer reads contacts: the walk-in's own phone. */
    contact: boolean;
    /** Delivery orders only. */
    address: string | null;
    shipment: Shipment | null;
    onChangeTracking: () => void;
    orderNote: string | null;
}) {
    if (!walkIn) {
        return (
            <p className="rounded-xl border border-border bg-card px-4 py-[13px] text-[12.5px] text-muted-foreground">
                This customer&apos;s record is gone. The order keeps what was
                bought.
            </p>
        );
    }
    const phone = walkIn.phone;
    return (
        <Panel aria-label="Customer">
            <div className="flex items-center gap-2.5">
                <span
                    aria-hidden
                    className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-bold"
                >
                    {initials(walkIn.name)}
                </span>
                <div className="min-w-0">
                    <div className="break-words text-[14px] font-semibold text-foreground">
                        <span className="font-medium text-muted-foreground">
                            Walk-in ·{" "}
                        </span>
                        {walkIn.name}
                    </div>
                    <div className="text-[12px] text-muted-foreground">
                        No customer record
                    </div>
                </div>
            </div>
            <div className="mt-2.5 flex flex-col gap-[3px] text-[12.5px] text-neutral-700 dark:text-muted-foreground">
                {contact ? (
                    phone ? (
                        <a
                            href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                            className={cn(
                                FOCUS,
                                "self-start rounded-sm text-foreground underline-offset-4 hover:underline active:opacity-80",
                            )}
                        >
                            {phone}
                        </a>
                    ) : (
                        <span>No phone</span>
                    )
                ) : null}
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
