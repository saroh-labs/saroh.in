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
import { formatMoney } from "@/lib/format/money";

/**
 * Contacts as a customer record, not an address book.
 *
 * Twenty-four identical name-and-email cards made the merchant click to learn
 * anything. The rollup columns are the point of the screen: open pipeline value
 * and the next booking are what answer *who is worth calling today* without
 * leaving it.
 *
 * WHAT IS STILL MISSING, and deliberately not faked: there is no "last order".
 * Orders belong to a commerce Customer, joined to a CRM Contact only through an
 * explicit identity link a human makes (#120). Matching the two by email would
 * be the auto-linking SEC-005 / ARCH-001 have not approved, and rendering the
 * column from today's sparse links would print "no orders" against customers
 * who have ordered. See `docs/design/workspace-redesign.md`.
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
                    className="font-medium underline-offset-4 hover:text-brand hover:underline"
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
            cell: (c) => c.company ?? <Missing />,
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
            id: "email",
            header: "Email",
            priority: "detail",
            sortValue: (c) => c.email.toLowerCase(),
            cell: (c) => (
                <span className="text-muted-foreground">{c.email}</span>
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
