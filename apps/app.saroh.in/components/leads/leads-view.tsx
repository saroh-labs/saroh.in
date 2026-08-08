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
import { ViewerDate } from "@/components/shared/viewer-date";
import { contactName } from "@/lib/crm/format";
import { formatWaiting } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import type { LeadListItem, LeadStatus } from "@/lib/leads/service";

/**
 * The pipeline as a register.
 *
 * A lead's row has to answer three questions at once — how much, how far along,
 * and how long has it sat — because that is the triage a merchant does before
 * deciding who to call. Cards answered none of them without a click.
 *
 * The `open` filter id is a URL contract: Home's "Open leads" tile links to
 * `/leads?view=open`, so renaming it breaks a destination the API already
 * hands merchants. See `DataFilter`.
 */

const STATUS: Record<LeadStatus, string> = {
    // Won is the brand's own colour because it is the outcome the whole screen
    // is for; lost is muted rather than destructive — a lost lead is a normal
    // result, not an error the merchant should be alarmed by.
    OPEN: "border-border text-foreground bg-transparent border",
    WON: "border border-brand/30 bg-brand-subtle text-brand-subtle-foreground",
    LOST: "text-muted-foreground border-border bg-transparent border",
};

const FILTERS: DataFilter<LeadListItem>[] = [
    { id: "all", label: "All" },
    { id: "open", label: "Open", predicate: (l) => l.status === "OPEN" },
    { id: "won", label: "Won", predicate: (l) => l.status === "WON" },
    { id: "lost", label: "Lost", predicate: (l) => l.status === "LOST" },
];

const Missing = () => <span className="text-muted-foreground/60">—</span>;

export function LeadsView({
    leads,
    initialView,
}: {
    leads: LeadListItem[];
    initialView?: string;
}) {
    const now = new Date();

    const columns: DataColumn<LeadListItem>[] = [
        {
            id: "title",
            header: "Lead",
            priority: "primary",
            sortValue: (l) => l.title.toLowerCase(),
            cell: (l) => (
                <Link
                    href={`/leads/${l.id}`}
                    className="font-medium underline-offset-4 hover:text-brand hover:underline"
                >
                    {l.title}
                </Link>
            ),
        },
        {
            id: "contact",
            header: "Contact",
            priority: "secondary",
            sortValue: (l) =>
                (l.contact ? contactName(l.contact) : "").toLowerCase(),
            cell: (l) =>
                l.contact ? (
                    <Link
                        href={`/contacts/${l.contact.id}`}
                        className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                        {contactName(l.contact)}
                    </Link>
                ) : (
                    <Missing />
                ),
        },
        {
            id: "value",
            header: "Value",
            priority: "secondary",
            numeric: true,
            sortValue: (l) => l.value ?? 0,
            // No currency is recorded against a Lead anywhere in the schema, so
            // none is drawn — see `lib/format/money.ts`.
            cell: (l) => formatMoney(l.value, null) ?? <Missing />,
        },
        {
            id: "stage",
            header: "Stage",
            priority: "secondary",
            sortValue: (l) => l.stage?.order ?? Number.MAX_SAFE_INTEGER,
            cell: (l) =>
                l.stage ? (
                    <Badge variant="secondary" className="font-normal">
                        {l.stage.name}
                    </Badge>
                ) : (
                    <Missing />
                ),
        },
        {
            id: "status",
            header: "Status",
            priority: "secondary",
            sortValue: (l) => l.status,
            cell: (l) => (
                <Badge
                    className={cn(
                        "text-[0.625rem] font-medium uppercase tracking-wider",
                        STATUS[l.status],
                    )}
                >
                    {l.status}
                </Badge>
            ),
        },
        {
            id: "age",
            header: "Age",
            priority: "detail",
            numeric: true,
            sortValue: (l) => new Date(l.createdAt).getTime(),
            // Time as a state, not a date string: "31 days waiting" is a fact a
            // merchant can act on, "4 Jul 2026" is arithmetic homework.
            cell: (l) =>
                // A duration is timezone-independent, so an open lead's age
                // renders directly; a settled lead shows the date it was raised,
                // which is not, hence `ViewerDate`.
                l.status === "OPEN" ? (
                    <span className="whitespace-nowrap text-muted-foreground">
                        {formatWaiting(l.createdAt, now) ?? "—"}
                    </span>
                ) : (
                    <ViewerDate
                        iso={l.createdAt}
                        className="whitespace-nowrap text-muted-foreground"
                    />
                ),
        },
    ];

    return (
        <DataView
            viewId="leads"
            rows={leads}
            columns={columns}
            rowKey={(l) => l.id}
            rowHref={(l) => `/leads/${l.id}`}
            modes={["table", "list"]}
            defaultMode="table"
            filters={FILTERS}
            initialFilterId={initialView}
            searchableColumnIds={["title", "contact", "stage"]}
            empty="Leads appear here as enquiries come in. You can also create one by hand from a contact."
            renderCard={(l) => (
                <Link href={`/leads/${l.id}`} className="block">
                    {/* `wk-surface`, not a brand-tinted hover edge: the card is a
                        surface, not a link, and the link colour on its border
                        read as though the outline itself were clickable. The
                        shared hover darkens the line and lifts instead. */}
                    <Card className="wk-surface h-full">
                        <CardContent className="space-y-1 p-4">
                            <p className="font-medium">{l.title}</p>
                            <p className="text-sm text-muted-foreground">
                                {l.contact
                                    ? contactName(l.contact)
                                    : "Unknown contact"}
                            </p>
                        </CardContent>
                    </Card>
                </Link>
            )}
        />
    );
}
