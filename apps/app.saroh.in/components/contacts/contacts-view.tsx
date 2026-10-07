"use client";

import { Badge } from "@saroh/ui/badge";
import { Card, CardContent } from "@saroh/ui/card";
import Link from "next/link";
import type { ReactNode } from "react";

import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import { ViewerDate } from "@/components/shared/viewer-date";
import type { ContactListItem } from "@/lib/contacts/service";
import { contactSourceLabel } from "@/lib/contacts/source";
import { contactName, openLeadsLabel, shownEmail } from "@/lib/crm/format";
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
const Missing = () => <span className="text-muted-foreground">—</span>;

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

/** The phone's labelled facts about a contact, or nothing. */
export function ContactSummary({ contact: c }: { contact: ContactListItem }) {
    const leads = openLeadsLabel(
        c.openLeadCount,
        formatMoney(c.openLeadValue, null),
    );
    const parts: { key: string; node: ReactNode }[] = [];
    if (c.company) parts.push({ key: "company", node: c.company });
    if (leads) parts.push({ key: "leads", node: leads });
    if (c.nextBookingAt) {
        parts.push({
            key: "booking",
            node: (
                <>
                    Next booking <ViewerDate iso={c.nextBookingAt} />
                </>
            ),
        });
    }
    if (c.lastOrderAt) {
        const total = formatMoneyMajor(c.lastOrderTotal, c.lastOrderCurrency);
        parts.push({
            key: "order",
            node: total ? `Last order ${total}` : "Has ordered",
        });
    }
    if (parts.length === 0) return null;
    return (
        <span className="inline-flex flex-wrap gap-x-1">
            {parts.map((part, i) => (
                <span key={part.key}>
                    {i > 0 ? "· " : null}
                    {part.node}
                </span>
            ))}
        </span>
    );
}

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
            // Text, not a link: DataView makes the first cell the row's link
            // (`rowHref`), and a link inside it would nest one <a> in another
            // — invalid HTML that breaks hydration.
            cell: (c) => (
                <span
                    // A person's name is the row's handle; breaking it across
                    // two lines to save horizontal space costs a whole extra
                    // row of height on EVERY row to buy a few pixels on one.
                    className="whitespace-nowrap font-medium"
                >
                    {contactName(c)}
                </span>
            ),
        },
        {
            // The phone's line under the name (UX-051): each fact in words
            // with its label, and nothing for a fact that isn't there —
            // not a row of bare dashes. The table has a column for each.
            id: "summary",
            header: "Summary",
            priority: "secondary",
            tableHidden: true,
            cell: (c) => <ContactSummary contact={c} />,
        },
        {
            id: "company",
            header: "Company",
            priority: "detail",
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
            priority: "detail",
            numeric: true,
            money: true,
            // Sorted on VALUE, so "who owes us the most conversation" is one
            // click. Unvalued open leads sort as 0 but still render their count,
            // which is the honest ordering: we cannot rank an unknown amount.
            sortValue: (c) => c.openLeadValue ?? 0,
            // Words, not "unvalued (1)" (UX-051). Lead amounts carry no
            // currency anywhere in the schema, so none is drawn — see
            // `lib/format/money.ts`.
            cell: (c) => {
                const label = openLeadsLabel(
                    c.openLeadCount,
                    formatMoney(c.openLeadValue, null),
                );
                return label ? (
                    <span className="whitespace-nowrap">{label}</span>
                ) : (
                    <Missing />
                );
            },
        },
        {
            id: "nextBooking",
            header: "Next booking",
            priority: "detail",
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
            priority: "detail",
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
            sortValue: (c) => (shownEmail(c) ?? "").toLowerCase(),
            // The one column allowed to give up space: an address is recognised
            // from its start, and the full value is a click away on the row.
            // The cap only lifts at `2xl`, where the other seven columns fit
            // without it — releasing it at `xl` pushed "Added" off the edge on a
            // 1440px screen, which is the commonest desktop this will run on.
            cell: (c) => (
                <span className="block max-w-[16ch] truncate text-muted-foreground 2xl:max-w-none">
                    {/* Never the placeholder a site account's own record
                        holds (UX-013): the address they sign in with. */}
                    {shownEmail(c) ?? <Missing />}
                </span>
            ),
        },
        {
            id: "source",
            header: "Source",
            priority: "detail",
            sortValue: (c) =>
                (c.source ? contactSourceLabel(c.source) : "").toLowerCase(),
            // In words (UX-051): "Enquiry", "Signed in on your site" — never
            // the stored `enquiry:form:<id>` or `SITE-ACCOUNT`.
            cell: (c) => {
                const label = c.source ? contactSourceLabel(c.source) : null;
                return label ? (
                    <Badge
                        variant="secondary"
                        className="whitespace-nowrap text-[11px] font-medium"
                    >
                        {label}
                    </Badge>
                ) : (
                    <Missing />
                );
            },
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
                    {/* `wk-surface`, not a brand-tinted hover edge: the card is a
                        surface, not a link, and the link colour on its border
                        read as though the outline itself were clickable. The
                        shared hover darkens the line and lifts instead. */}
                    <Card className="wk-surface h-full">
                        <CardContent className="space-y-1 p-4">
                            <p className="font-medium">{contactName(c)}</p>
                            {shownEmail(c) ? (
                                <p className="truncate text-sm text-muted-foreground">
                                    {shownEmail(c)}
                                </p>
                            ) : null}
                            {c.company ? (
                                <p className="text-xs text-muted-foreground">
                                    {c.company}
                                </p>
                            ) : null}
                            {c.openLeadCount > 0 ? (
                                /* `text-foreground`, not `text-brand`. Brand is
                                   the link colour everywhere else in the
                                   product, and this line sits INSIDE a link
                                   whose target is the whole card — colouring
                                   one line blue said "this line is the link",
                                   which is not where the click goes. The
                                   emphasis it needs is contrast against the
                                   muted lines above it, and full-strength
                                   foreground at medium weight already gives
                                   that without spending a hue. */
                                <p className="pt-1 text-xs font-medium text-foreground">
                                    {openLeadsLabel(
                                        c.openLeadCount,
                                        formatMoney(c.openLeadValue, null),
                                    )}
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>
                </Link>
            )}
        />
    );
}
