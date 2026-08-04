"use client";

import { Badge } from "@saroh/ui/badge";
import { Card, CardContent } from "@saroh/ui/card";
import Link from "next/link";

import { DataView } from "@/components/shared/data-view/data-view";
import type { DataColumn } from "@/components/shared/data-view/types";
import type { Contact } from "@/lib/contacts/service";
import { contactName } from "@/lib/crm/format";

/**
 * Contacts as data, not as a wall of cards.
 *
 * Twenty-four identical name-and-email cards is not a directory, it is a list
 * that made the merchant click to learn anything. A sortable, searchable table
 * lets them answer "who came from Instagram", "who was added this week" and
 * "which company is this" without leaving the screen.
 *
 * WHAT IS MISSING, and deliberately not faked: the columns that would make this
 * a customer record rather than an address book — open lead value, last order,
 * next booking — are not in `listContacts`. They exist only on the detail
 * endpoint, so putting them here needs an API rollup that does not exist yet.
 * Inventing them would be a claim the product cannot back. See
 * `docs/design/workspace-redesign.md` step 2.
 */
const dateOf = (iso: string) => new Date(iso).getTime();

/** A known absence, drawn so it cannot be mistaken for a failed render. */
const Missing = () => <span className="text-muted-foreground/60">—</span>;

const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
    });

export function ContactsView({ contacts }: { contacts: Contact[] }) {
    const columns: DataColumn<Contact>[] = [
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
            id: "email",
            header: "Email",
            priority: "secondary",
            sortValue: (c) => c.email.toLowerCase(),
            cell: (c) => (
                <span className="text-muted-foreground">{c.email}</span>
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
            sortValue: (c) => dateOf(c.createdAt),
            cell: (c) => (
                <span className="whitespace-nowrap text-muted-foreground">
                    {formatDate(c.createdAt)}
                </span>
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
                        </CardContent>
                    </Card>
                </Link>
            )}
        />
    );
}
