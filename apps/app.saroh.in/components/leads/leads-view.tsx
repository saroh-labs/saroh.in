"use client";

import { AbsentValue } from "@saroh/ui/absent-value";
import type { BadgeProps } from "@saroh/ui/badge";
import { Badge } from "@saroh/ui/badge";
import { Card, CardContent } from "@saroh/ui/card";
import { IntentLink } from "@saroh/ui/intent-link";

import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { contactName } from "@/lib/crm/format";
import { formatWaiting } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { formatStatus } from "@/lib/format/status";
import type { LeadListItem, LeadStatus, OpenTask } from "@/lib/leads/service";
import { leadSubject, nextFollowUps } from "@/lib/leads/subject";
import { phoneLabel } from "@/lib/organizations/business-phone";
import { Inbox } from "lucide-react";

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

const STATUS: Record<LeadStatus, NonNullable<BadgeProps["variant"]>> = {
    // Won is success because it is the outcome the whole screen is for; lost
    // is neutral rather than destructive — a lost lead is a normal result, not
    // an error the merchant should be alarmed by.
    OPEN: "outline",
    WON: "success",
    LOST: "neutral",
};

/**
 * Open first, so the list opens on it (DEC-277): won and lost are views,
 * and `?view=all` is everything. "Follow up today" is due today or late.
 */
function filtersFor(
    next: Map<string, string>,
    now: Date,
): DataFilter<LeadListItem>[] {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return [
        {
            id: "open",
            label: "Open leads",
            predicate: (l) => l.status === "OPEN",
        },
        {
            id: "today",
            label: "Follow up today",
            predicate: (l) => {
                const due = next.get(l.id);
                return l.status === "OPEN" && !!due && new Date(due) <= end;
            },
        },
        { id: "won", label: "Won", predicate: (l) => l.status === "WON" },
        { id: "lost", label: "Lost", predicate: (l) => l.status === "LOST" },
        { id: "all", label: "All" },
    ];
}

const Missing = () => <AbsentValue says="Not set" />;

/** The name a lead's row leads with: the person's, else its title. */
function leadName(l: LeadListItem): string {
    return l.contact ? contactName(l.contact) : l.title;
}

/** A phone card's second line: what the lead is about, else its stage. */
function cardLine(
    l: LeadListItem,
    contact: NonNullable<LeadListItem["contact"]>,
) {
    const subject = leadSubject(l.title, contactName(contact));
    return subject === "" ? (l.stage?.name ?? "") : subject;
}

const LAST_KIND = { NOTE: "Note", FOLLOW_UP: "Follow-up done" } as const;

export function LeadsView({
    leads,
    currency,
    initialView,
    tasks = null,
}: {
    leads: LeadListItem[];
    /** The business's currency: what a lead's Worth is in (owner, 11 Oct). */
    currency: string;
    initialView?: string;
    /** The open follow-ups, for Next follow-up; null when unread. */
    tasks?: OpenTask[] | null;
}) {
    const now = new Date();
    const next = nextFollowUps(tasks);
    // Soonest follow-up first; those with none after, newest first.
    const rows = [...leads].sort((a, b) => {
        const an = next.get(a.id);
        const bn = next.get(b.id);
        if (an && bn) return an.localeCompare(bn);
        if (an) return -1;
        if (bn) return 1;
        return b.createdAt.localeCompare(a.createdAt);
    });
    const valued = leads.some((l) => l.value !== null);

    const all: (DataColumn<LeadListItem> | false)[] = [
        {
            id: "title",
            header: "Lead",
            priority: "primary",
            // The person once, the subject under it (DEC-277): the title
            // repeated the name the next column said again.
            sortValue: (l) => `${leadName(l)} ${l.title}`.toLowerCase(),
            // Plain text: the table wraps the primary cell in the row's own
            // link (`rowHref`), and a link inside a link is invalid HTML that
            // broke hydration on every load of this screen.
            cell: (l) => {
                const name = leadName(l);
                const subject = l.contact
                    ? leadSubject(l.title, contactName(l.contact))
                    : "";
                return (
                    <span className="grid">
                        <span className="font-medium">{name}</span>
                        {subject ? (
                            <span className="text-[12px] text-muted-foreground">
                                {subject}
                            </span>
                        ) : null}
                    </span>
                );
            },
        },
        {
            id: "phone",
            header: "Phone",
            priority: "detail",
            sortValue: (l) => l.contact?.phone ?? "",
            cell: (l) =>
                l.contact?.phone?.trim() ? (
                    <a
                        href={`tel:${l.contact.phone.replace(/[^\d+]/g, "")}`}
                        className="relative z-10 whitespace-nowrap tabular-nums underline-offset-4 hover:underline"
                    >
                        {phoneLabel(l.contact.phone)}
                    </a>
                ) : (
                    <AbsentValue says="No phone" />
                ),
        },
        valued && {
            id: "value",
            header: "Worth",
            priority: "detail",
            numeric: true,
            money: true,
            sortValue: (l) => l.value ?? 0,
            // A lead records an amount and no currency: it is in the
            // business's (owner, 11 Oct). Empty is the absent mark.
            cell: (l) =>
                formatMoney(l.value, currency) ?? (
                    <AbsentValue says="Not set" />
                ),
        },
        {
            id: "stage",
            header: "Stage",
            priority: "secondary",
            sortValue: (l) => l.stage?.order ?? Number.MAX_SAFE_INTEGER,
            cell: (l) =>
                l.stage ? (
                    <Badge variant="secondary">{l.stage.name}</Badge>
                ) : (
                    <Missing />
                ),
        },
        {
            id: "next",
            header: "Next follow-up",
            priority: "secondary",
            sortValue: (l) => {
                const due = next.get(l.id);
                return due ? new Date(due).getTime() : Number.MAX_SAFE_INTEGER;
            },
            cell: (l) => {
                const due = next.get(l.id);
                if (!due) {
                    return l.status === "OPEN" ? (
                        <AbsentValue says="None set" />
                    ) : (
                        <Badge variant={STATUS[l.status]}>
                            {formatStatus(l.status)}
                        </Badge>
                    );
                }
                const late = new Date(due) < now;
                return (
                    <span
                        className={
                            late
                                ? "whitespace-nowrap font-medium text-destructive-subtle-foreground"
                                : "whitespace-nowrap"
                        }
                    >
                        {late ? "Late · " : "Follow up "}
                        <ViewerDate iso={due} />
                    </span>
                );
            },
        },
        {
            id: "lastContact",
            header: "Last contact",
            priority: "detail",
            sortValue: (l) =>
                l.lastContact ? new Date(l.lastContact.at).getTime() : 0,
            cell: (l) =>
                l.lastContact ? (
                    <span className="whitespace-nowrap">
                        <ViewerDate iso={l.lastContact.at} />
                        {` · ${LAST_KIND[l.lastContact.kind]}`}
                    </span>
                ) : (
                    <AbsentValue says="Not yet" />
                ),
        },
        {
            id: "age",
            header: "Age",
            priority: "secondary",
            // On a phone the age stays, at the row's end (DEC-277).
            listPlace: "end",
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
                        {formatWaiting(l.createdAt, now) ?? (
                            <AbsentValue says="Not known" />
                        )}
                    </span>
                ) : (
                    <ViewerDate
                        iso={l.createdAt}
                        className="whitespace-nowrap text-muted-foreground"
                    />
                ),
        },
    ];
    const columns = all.filter((c): c is DataColumn<LeadListItem> => !!c);

    return (
        <DataView
            viewId="leads"
            rows={rows}
            columns={columns}
            rowKey={(l) => l.id}
            rowHref={(l) => `/leads/${l.id}`}
            modes={["table", "list"]}
            defaultMode="table"
            noun={{ one: "lead", other: "leads" }}
            showTotal={false}
            filters={filtersFor(next, now)}
            initialFilterId={initialView}
            // Leads | Follow-ups is the page's tab row; status narrows the
            // list, as the chip row.
            searchableColumnIds={["title", "stage"]}
            emptyState={{
                icon: <Inbox />,
                title: "No leads yet",
                note: "They show here as enquiries come in, or when you add one.",
            }}
            renderCard={(l) => (
                <IntentLink href={`/leads/${l.id}`} className="block">
                    {/* `wk-surface`, not a brand-tinted hover edge: the card is a
                        surface, not a link, and the link colour on its border
                        read as though the outline itself were clickable. The
                        shared hover darkens the line and lifts instead. */}
                    <Card className="wk-surface h-full">
                        <CardContent className="space-y-1 p-4">
                            <p className="font-medium">{leadName(l)}</p>
                            <p className="text-sm text-muted-foreground">
                                {l.contact
                                    ? cardLine(l, l.contact)
                                    : "Unknown contact"}
                            </p>
                            {l.value === null ? null : (
                                <p className="text-sm tabular-nums">
                                    {formatMoney(l.value, currency)}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </IntentLink>
            )}
        />
    );
}
