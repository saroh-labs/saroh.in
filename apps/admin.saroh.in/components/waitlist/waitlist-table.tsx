"use client";

import type { DataColumn } from "@saroh/ui/data-view";
import { DataView } from "@saroh/ui/data-view";
import Link from "next/link";

import { countryName, formatDate, formatRelative } from "@/lib/format";
import { SERVER_PAGED } from "@/lib/server-paged";
import type { WaitlistRow } from "@/lib/waitlist";
import { kindLabel } from "@/lib/waitlist-words";

import { InviteState } from "./invite-state";
import { RemoveEntry } from "./remove-entry";

function columns(invited: boolean): DataColumn<WaitlistRow>[] {
    return [
        {
            id: "business",
            header: "Business",
            priority: "primary",
            cell: (row) => (
                <div className="min-w-0">
                    <p className="font-medium">{row.businessName ?? "—"}</p>
                    <p className="break-all text-muted-foreground">
                        {row.email}
                    </p>
                </div>
            ),
        },
        {
            id: "position",
            header: "#",
            priority: "detail",
            width: "64px",
            numeric: true,
            cell: (row) => row.position,
        },
        {
            id: "kind",
            header: "Kind",
            priority: "secondary",
            cell: (row) => (
                <span>
                    {row.kind ? kindLabel(row.kind) : "—"}
                    {row.plan && (
                        <span className="block text-muted-foreground">
                            Asked about {row.plan}
                        </span>
                    )}
                </span>
            ),
        },
        {
            id: "city",
            header: "City",
            priority: "secondary",
            cell: (row) => (
                <span>
                    {row.city ?? "—"}
                    {row.country && (
                        <span className="block text-muted-foreground">
                            {countryName(row.country)}
                        </span>
                    )}
                </span>
            ),
        },
        {
            id: "source",
            header: "Source",
            priority: "detail",
            cell: (row) => (
                <span className="text-muted-foreground">
                    {row.source ?? "—"}
                </span>
            ),
        },
        {
            id: "referrals",
            header: "Referred",
            priority: "detail",
            width: "90px",
            numeric: true,
            cell: (row) => row.referrals,
        },
        {
            id: "since",
            header: invited ? "Invited" : "Waiting since",
            priority: "secondary",
            cell: (row) => (
                <span title={formatDate(row.invitedAt ?? row.createdAt)}>
                    {formatRelative(row.invitedAt ?? row.createdAt)}
                    {row.invitedAt && <InviteState row={row} />}
                </span>
            ),
        },
        {
            id: "lead",
            header: "Lead",
            priority: "secondary",
            width: "80px",
            // Read-only links: the same person on the Leads board.
            cell: (row) =>
                row.isLead ? (
                    <Link
                        href={`/leads?q=${encodeURIComponent(row.email)}`}
                        className="relative underline underline-offset-4"
                    >
                        Lead
                    </Link>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
    ];
}

/**
 * The waitlist's rows (admin audit F13): a table on a desk, stacked rows on
 * a phone, with Remove beside each row in both, never scrolled off-screen.
 */
export function WaitlistTable({
    rows,
    invited,
    canRemove,
}: {
    rows: WaitlistRow[];
    invited: boolean;
    canRemove: boolean;
}) {
    return (
        <DataView
            viewId="console-waitlist"
            rows={rows}
            columns={columns(invited)}
            rowKey={(row) => row.id}
            modes={["table", "list"]}
            hideModeToggle
            showTotal={false}
            noun={{ one: "person", other: "people" }}
            paging={SERVER_PAGED}
            rowActions={
                canRemove
                    ? (row) => (
                          <RemoveEntry
                              id={row.id}
                              label={row.businessName ?? row.email}
                          />
                      )
                    : undefined
            }
        />
    );
}
