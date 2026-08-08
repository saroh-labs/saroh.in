"use client";

import { Badge } from "@saroh/ui/badge";
import { Card, CardContent } from "@saroh/ui/card";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import { formatMoney } from "@/lib/format/money";
import type { Service } from "@/lib/services/service";

/**
 * The bookable catalog as a register.
 *
 * Duration, capacity and price were buried in one run-on description line, so
 * comparing two services meant reading two sentences. In columns they compare at
 * a glance — which is the whole job of this screen when a merchant is deciding
 * what to change.
 *
 * Price is the one place in the app where a currency IS recorded per row
 * (`Service.currency`), so it is drawn — unlike lead values, which have none.
 */

const Missing = () => <span className="text-muted-foreground/60">—</span>;

const FILTERS: DataFilter<Service>[] = [
    { id: "all", label: "All" },
    {
        id: "active",
        label: "Bookable",
        predicate: (s) => s.status === "ACTIVE",
    },
    {
        id: "draft",
        label: "Not bookable",
        predicate: (s) => s.status !== "ACTIVE",
    },
];

export function ServicesView({
    services,
    initialView,
}: {
    services: Service[];
    initialView?: string;
}) {
    const columns: DataColumn<Service>[] = [
        {
            id: "name",
            header: "Service",
            priority: "primary",
            sortValue: (s) => s.name.toLowerCase(),
            cell: (s) => (
                <Link
                    href={`/services/${s.id}`}
                    className="font-medium underline-offset-4 hover:text-brand hover:underline"
                >
                    {s.name}
                </Link>
            ),
        },
        {
            id: "duration",
            header: "Duration",
            priority: "secondary",
            numeric: true,
            sortValue: (s) => s.durationMinutes,
            cell: (s) => (
                <span className="whitespace-nowrap">
                    {s.durationMinutes} min
                </span>
            ),
        },
        {
            id: "price",
            header: "Price",
            priority: "secondary",
            numeric: true,
            sortValue: (s) => s.priceCents ?? 0,
            cell: (s) => formatMoney(s.priceCents, s.currency) ?? <Missing />,
        },
        {
            id: "capacity",
            header: "Capacity",
            priority: "detail",
            numeric: true,
            sortValue: (s) => s.capacity,
            cell: (s) => s.capacity,
        },
        {
            id: "timezone",
            header: "Timezone",
            priority: "detail",
            sortValue: (s) => s.timezone,
            cell: (s) => (
                <span className="whitespace-nowrap text-muted-foreground">
                    {s.timezone}
                </span>
            ),
        },
        {
            id: "status",
            header: "Status",
            priority: "secondary",
            sortValue: (s) => s.status,
            cell: (s) => (
                <Badge
                    className={cn(
                        "text-[0.625rem] font-medium uppercase tracking-wider",
                        s.status === "ACTIVE"
                            ? "border border-brand/30 bg-brand-subtle text-brand-subtle-foreground"
                            : "border border-border bg-transparent text-muted-foreground",
                    )}
                >
                    {s.status}
                </Badge>
            ),
        },
    ];

    return (
        <DataView
            viewId="services"
            rows={services}
            columns={columns}
            rowKey={(s) => s.id}
            rowHref={(s) => `/services/${s.id}`}
            modes={["table", "grid", "list"]}
            defaultMode="table"
            filters={FILTERS}
            initialFilterId={initialView}
            searchableColumnIds={["name", "timezone"]}
            empty="Create a bookable service, add availability windows, then drop a Booking section onto a site so visitors can book."
            renderCard={(s) => (
                <Link href={`/services/${s.id}`} className="block">
                    {/* The card is the link target, so it gets the hover lift.
                        The local transition + brand hover border are dropped:
                        wk-surface owns both, and a blue edge would put the link
                        colour on something that is a surface, not a link. */}
                    <Card className="wk-surface h-full">
                        <CardContent className="space-y-1 p-4">
                            <p className="font-medium">{s.name}</p>
                            <p className="text-sm text-muted-foreground">
                                {s.durationMinutes} min
                                {s.capacity > 1
                                    ? ` · capacity ${s.capacity}`
                                    : ""}
                            </p>
                            {formatMoney(s.priceCents, s.currency) ? (
                                <p className="pt-1 text-sm font-medium tabular-nums">
                                    {formatMoney(s.priceCents, s.currency)}
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>
                </Link>
            )}
        />
    );
}
