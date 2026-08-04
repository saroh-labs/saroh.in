"use client";

import { Badge } from "@saroh/ui/badge";
import { Card, CardContent } from "@saroh/ui/card";
import Link from "next/link";

import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import { ViewerDate } from "@/components/shared/viewer-date";
import type { ContactListItem } from "@/lib/contacts/service";
import { contactName } from "@/lib/crm/format";
import { formatMoney, formatMoneyMajor } from "@/lib/format/money";

/**
 * Contacts as a customer record, not an address book.
 *
 * Twenty-four identical name-and-email cards made the merchant click to learn
 * anything. The rollup columns are the point of the screen: open pipeline, the
 * next booking and the last order are what answer _who is worth calling today_
 * without leaving it.
 *
 * "Last order" is a read-time reconciliation on the API (explicit identity links
 * plus a same-org email match, never written back). It can be silent for someone
 * who ordered under a different address, so an empty cell here means "no order
 * we can attribute", not "never bought" — which is why it renders as a known
 * absence rather than a zero.
 */

/** A known absence, drawn so it cannot be mistaken for a failed render. */
const Missing = () => <span className="text-muted-foreground/60">—</span>;

const FILTERS: DataFilter<ContactListItem>[] = [
    { id: "all", label: "All" },
    {
        id: "open",
        label: "Open pipeline",
        predicate: (c) => c.openLeadCount > 0,
    },
    {
        id: "booked",
        label: "Booked in",
        predicate: (c) => c.nextBookingAt !== null,
    },
    {
        id: "buyers",
        label: "Have bought",
        predicate: (c) => c.lastOrderAt !== null,
    },
];

export function ContactsView({
    contacts,
    initialView,
}: {
    contacts: ContactListItem[];
    initialView?: string;
}) {
    const columns: DataColumn<ContactListItem>[] = [
        {
            id: "name",
            header: "Name",
            priority: "primary",
            sortValue: (c) => contactName(c).toLowerCase(),
            cell: (c) => (
                <Link
                    href={`/contacts/${c.id}`}
                    // A person's name is the row's handle; breaking it across
                    // two lines to save horizontal space costs a whole extra
                    // row of height on EVERY row to buy a few pixels on one.
                    className="whitespace-nowrap font-medium underline-offset-4 hover:text-brand hover:underline"
                >
                    {contactName(c)}
                </Link>
            ),
        },
        {
            id: "company",
            header: "Company",
            priority: "secondary",
            sortValue: (c) => (c.company ?? "").toLowerCase(),
            // An em dash, not blank: a blank cell reads as a rendering bug,
            // while a dash reads as "we know, and there isn't one".
            cell: (c) =>
                c.company ? (
                    <span className="whitespace-nowrap">{c.company}</span>
                ) : (
                    <Missing />
                ),
        },
        {
            id: "pipeline",
            header: "Open pipeline",
            priority: "secondary",
            numeric: true,
            // Sorted on VALUE, so "who owes us the most conversation" is one
            // click. Unvalued open leads sort as 0 but still render their count,
            // which is the honest ordering: we cannot rank an unknown amount.
            sortValue: (c) => c.openLeadValue ?? 0,
            cell: (c) => {
                if (c.openLeadCount === 0) return <Missing />;
                // Lead amounts carry no currency anywhere in the schema, so
                // none is drawn — see `lib/format/money.ts`.
                const amount = formatMoney(c.openLeadValue, null);
                return (
                    <span className="whitespace-nowrap">
                        {amount ?? (
                            <span className="text-muted-foreground">
                                unvalued
                            </span>
                        )}
                        <span className="ml-1.5 text-xs text-muted-foreground">
                            ({c.openLeadCount})
                        </span>
                    </span>
                );
            },
        },
        {
            id: "nextBooking",
            header: "Next booking",
            priority: "secondary",
            sortValue: (c) =>
                c.nextBookingAt
                    ? new Date(c.nextBookingAt).getTime()
                    : // Never-booked sorts last ascending, which is what a
                      // merchant scanning for upcoming appointments wants.
                      Number.MAX_SAFE_INTEGER,
            cell: (c) =>
                c.nextBookingAt ? (
                    // The booking's OWN zone is not on this row — the list
                    // endpoint returns only the instant — so this shows the
                    // viewer's. Acceptable here and not on the Bookings screen,
                    // because this cell answers "is something coming up?" rather
                    // than "when do I need to be somewhere?".
                    <ViewerDate
                        iso={c.nextBookingAt}
                        variant="heading"
                        className="whitespace-nowrap"
                    />
                ) : (
                    <Missing />
                ),
        },
        {
            id: "lastOrder",
            header: "Last order",
            priority: "secondary",
            numeric: true,
            // Sorted by RECENCY, not amount: "who has gone quiet" is the
            // question this column exists to answer, and never-ordered sorts
            // last ascending rather than pretending to be the oldest.
            sortValue: (c) =>
                c.lastOrderAt
                    ? new Date(c.lastOrderAt).getTime()
                    : Number.MAX_SAFE_INTEGER,
            cell: (c) =>
                c.lastOrderAt ? (
                    <span className="whitespace-nowrap">
                        {formatMoneyMajor(
                            c.lastOrderTotal,
                            c.lastOrderCurrency,
                        )}{" "}
                        {/* A real space, not just `ml-1.5`: margin separates
                            the two visually but leaves the text nodes adjacent,
                            so anything reading the row aloud or copying it gets
                            "₹6,3729 Jul 2026". */}
                        <ViewerDate
                            iso={c.lastOrderAt}
                            className="ml-0.5 text-xs text-muted-foreground"
                        />
                    </span>
                ) : (
                    <Missing />
                ),
        },
        {
            id: "email",
            header: "Email",
            priority: "detail",
            sortValue: (c) => c.email.toLowerCase(),
            // The one column allowed to give up space: an address is recognised
            // from its start, and the full value is a click away on the row.
            // The cap only lifts at `2xl`, where the other seven columns fit
            // without it — releasing it at `xl` pushed "Added" off the edge on a
            // 1440px screen, which is the commonest desktop this will run on.
            cell: (c) => (
                <span className="block max-w-[16ch] truncate text-muted-foreground 2xl:max-w-none">
                    {c.email}
                </span>
            ),
        },
        {
            id: "source",
            header: "Source",
            priority: "detail",
            sortValue: (c) => (c.source ?? "").toLowerCase(),
            cell: (c) =>
                c.source ? (
                    <Badge
                        variant="secondary"
                        className="text-[0.625rem] font-medium uppercase tracking-wider"
                    >
                        {c.source.replace(/_/g, " ").toLowerCase()}
                    </Badge>
                ) : (
                    <Missing />
                ),
        },
        {
            id: "added",
            header: "Added",
            priority: "detail",
            numeric: true,
            sortValue: (c) => new Date(c.createdAt).getTime(),
            cell: (c) => (
                <ViewerDate
                    iso={c.createdAt}
                    className="whitespace-nowrap text-muted-foreground"
                />
            ),
        },
    ];

    return (
        <DataView
            viewId="contacts"
            rows={contacts}
            columns={columns}
            rowKey={(c) => c.id}
            rowHref={(c) => `/contacts/${c.id}`}
            modes={["table", "grid", "list"]}
            defaultMode="table"
            filters={FILTERS}
            initialFilterId={initialView}
            searchableColumnIds={["name", "email", "company", "source"]}
            empty="Contacts appear here as enquiries come in, or when you create a lead by hand."
            renderCard={(c) => (
                <Link href={`/contacts/${c.id}`} className="block">
                    <Card className="h-full transition-colors hover:border-brand/40">
                        <CardContent className="space-y-1 p-4">
                            <p className="font-medium">{contactName(c)}</p>
                            <p className="truncate text-sm text-muted-foreground">
                                {c.email}
                            </p>
                            {c.company ? (
                                <p className="text-xs text-muted-foreground">
                                    {c.company}
                                </p>
                            ) : null}
                            {c.openLeadCount > 0 ? (
                                <p className="pt-1 text-xs font-medium text-brand">
                                    {formatMoney(c.openLeadValue, null) ??
                                        "Unvalued"}{" "}
                                    open
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>
                </Link>
            )}
        />
    );
}
