import { buttonVariants } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { cn } from "@saroh/ui/lib/utils";
import { LinkPending } from "@saroh/ui/link-pending";
import { ScrollX } from "@saroh/ui/scroll-x";
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@saroh/ui/table";
import Link from "next/link";

import type {
    AdminAuditEvent,
    AdminAuditPage,
    AdminAuditQuery,
} from "@/lib/control-plane";

/**
 * Semantic status tokens, not raw palette classes. These previously hardcoded
 * emerald/red/amber with hand-written dark variants, which meant the audit
 * ledger did not move when the theme did. The DB pins `outcome` to exactly
 * these three values via a CHECK constraint, so the lookup is total.
 */
const OUTCOME_STYLES = {
    // The status tint mixed into the page, with its 700 text — never an alpha
    // of the fill (brand file §4).
    SUCCESS:
        "border-transparent bg-success-subtle text-success-subtle-foreground",
    FAILURE:
        "border-transparent bg-destructive-subtle text-destructive-subtle-foreground",
    DENIED: "border-transparent bg-warning-subtle text-warning-subtle-foreground",
} as const;

export function AdminAuditTable({
    page,
    query,
}: {
    page: AdminAuditPage;
    query: Omit<AdminAuditQuery, "limit">;
}) {
    if (page.items.length === 0) {
        return (
            <EmptyState
                title="No audit events found"
                description="Try removing a filter or return to the newest events."
            />
        );
    }

    return (
        <>
            {/*
             * The ledger keeps its columns at every width, so it scrolls
             * sideways and says so: ScrollX fades the side with more and
             * hints once (Phone Tables audit T9). A bare <table>, not
             * <Table>, whose own overflow wrapper would be the box that
             * scrolls, unmarked, inside this one.
             */}
            <ScrollX label="Audit events" className="rounded-lg border">
                <table className="w-full min-w-[1180px] caption-bottom text-sm">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>Actor</TableHead>
                            <TableHead>Action</TableHead>
                            <TableHead>Target</TableHead>
                            <TableHead>Outcome</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead>Correlation</TableHead>
                            <TableHead>Details</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {page.items.map((event) => (
                            <TableRow key={event.id} className="align-top">
                                <TableCell className="whitespace-nowrap text-muted-foreground">
                                    {formatTime(event.createdAt)}
                                </TableCell>
                                <TableCell className="max-w-48">
                                    {event.actorName && (
                                        <span className="block truncate">
                                            {event.actorName}
                                        </span>
                                    )}
                                    <span className="block truncate font-mono text-xs text-muted-foreground">
                                        {event.actorUserId}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <p className="font-medium">
                                        {event.action}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {event.permission}
                                    </p>
                                </TableCell>
                                <TableCell className="max-w-56">
                                    <p>{event.targetType}</p>
                                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                                        {event.targetId ?? "platform"}
                                    </p>
                                    {event.organizationId && (
                                        <p className="mt-1 truncate text-xs text-muted-foreground">
                                            {event.organizationName ??
                                                `Org: ${event.organizationId}`}
                                        </p>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <span
                                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLES[event.outcome]}`}
                                    >
                                        {event.outcome.toLowerCase()}
                                    </span>
                                </TableCell>
                                <TableCell className="max-w-72 text-muted-foreground">
                                    {event.reason ?? "—"}
                                </TableCell>
                                <TableCell className="max-w-48 font-mono text-xs text-muted-foreground">
                                    <span className="block truncate">
                                        {event.correlationId ?? "—"}
                                    </span>
                                </TableCell>
                                <TableCell className="max-w-80 text-xs">
                                    <EventDetails event={event} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </table>
            </ScrollX>

            <div className="mt-4 flex items-center justify-between gap-4">
                {query.cursor ? (
                    <Link
                        href={{
                            pathname: "/audit",
                            query: withoutCursor(query),
                        }}
                        className={cn(
                            "relative",
                            buttonVariants({
                                variant: "ghost",
                                size: "sm",
                            }),
                        )}
                    >
                        Back to newest
                        <LinkPending />
                    </Link>
                ) : (
                    <span />
                )}
                {page.nextCursor && (
                    <Link
                        href={{
                            pathname: "/audit",
                            query: {
                                ...withoutCursor(query),
                                cursor: page.nextCursor,
                            },
                        }}
                        className={cn(
                            "relative",
                            buttonVariants({
                                variant: "outline",
                                size: "sm",
                            }),
                        )}
                    >
                        Older events
                        <LinkPending />
                    </Link>
                )}
            </div>
        </>
    );
}

/** What the row holds beyond its columns: where from, and the metadata. */
function EventDetails({ event }: { event: AdminAuditEvent }) {
    const where = [event.ipAddress, event.userAgent, event.sessionId].filter(
        Boolean,
    );
    if (where.length === 0 && event.metadata == null) return "—";
    return (
        <details>
            <summary className="cursor-pointer text-muted-foreground">
                Show
            </summary>
            <dl className="mt-2 grid gap-1">
                {event.ipAddress && (
                    <div>
                        <dt className="text-muted-foreground">Address</dt>
                        <dd className="break-all font-mono">
                            {event.ipAddress}
                        </dd>
                    </div>
                )}
                {event.userAgent && (
                    <div>
                        <dt className="text-muted-foreground">Browser</dt>
                        <dd className="break-all">{event.userAgent}</dd>
                    </div>
                )}
                {event.sessionId && (
                    <div>
                        <dt className="text-muted-foreground">Session</dt>
                        <dd className="break-all font-mono">
                            {event.sessionId}
                        </dd>
                    </div>
                )}
                {event.metadata != null && (
                    <div>
                        <dt className="text-muted-foreground">Detail</dt>
                        <dd>
                            <pre className="whitespace-pre-wrap break-all font-mono">
                                {JSON.stringify(event.metadata, null, 2)}
                            </pre>
                        </dd>
                    </div>
                )}
            </dl>
        </details>
    );
}

function formatTime(value: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
    }).format(new Date(value));
}

function withoutCursor(
    query: Omit<AdminAuditQuery, "limit">,
): Record<string, string> {
    return Object.fromEntries(
        Object.entries({
            actorUserId: query.actorUserId,
            organizationId: query.organizationId,
            action: query.action,
            actor: query.actor,
            business: query.business,
        }).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
}
