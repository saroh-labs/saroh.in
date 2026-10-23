import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";

import Link from "next/link";
import type { ReactNode } from "react";

import { BusinessDate } from "@/components/shared/dates/business-zone";
import { howWords } from "@/lib/orders/lifecycle";
import type { StepTone } from "@/lib/orders/list-row";
import type { OrderRead } from "@/lib/orders/read";

import { StatusBadge } from "@/components/shared/lists/status-badge";

/**
 * The order's page header: "Sell › Orders › #1063", its number and status, how long it has waited ("Late" in words and
 * Saffron once the API says it is late, by its type's rule), when and where
 * it was placed and how it goes out — and, on the right, the actions the
 * screen passes in.
 */
export function OrderHeading({
    order,
    number,
    standing,
    age,
    how,
    children,
}: {
    order: OrderRead;
    number: string;
    standing: { label: string; tone: StepTone };
    age: { text: string; late: boolean; rule: string | null } | null;
    /**
     * How it is fulfilled, in words, where the type says more than
     * its type's word ("Pick-up at Hill Road"): "Booking, in person · next visit today,
     * 18:00" (B14).
     */
    how?: string;
    /** The header's buttons. */
    children: ReactNode;
}) {
    return (
        <PageHeader
            holdsData
            className="mb-0"
            breadcrumb={[
                "Sell",
                <Link key="orders" href="/commerce/orders">
                    Orders
                </Link>,
                number,
            ]}
            title={number}
            badge={
                <StatusBadge size="default" tone={standing.tone}>
                    {standing.label}
                </StatusBadge>
            }
            actions={
                <div className="flex max-w-full flex-wrap items-center gap-2 print:hidden">
                    {children}
                </div>
            }
            description={
                <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                    {age ? (
                        <span
                            title={age.rule ?? undefined}
                            className={cn(
                                "rounded-full border px-2 py-0.5 text-[12px] font-bold tabular-nums",
                                age.late
                                    ? "border-border-strong bg-muted text-foreground"
                                    : "border-transparent bg-muted text-neutral-700 dark:text-muted-foreground",
                            )}
                        >
                            {age.text}
                        </span>
                    ) : null}
                    <span>
                        <BusinessDate iso={order.placedAt} variant="moment" /> ·{" "}
                        {order.store.name} · {how ?? howWords(order)}
                    </span>
                </div>
            }
        />
    );
}
