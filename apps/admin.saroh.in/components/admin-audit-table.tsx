import { buttonVariants } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@saroh/ui/table";
import Link from "next/link";

import type { AdminAuditPage, AdminAuditQuery } from "@/lib/control-plane";

/**
 * Semantic status tokens, not raw palette classes. These previously hardcoded
 * emerald/red/amber with hand-written dark variants, which meant the audit
 * ledger did not move when the theme did. The DB pins `outcome` to exactly
 * these three values via a CHECK constraint, so the lookup is total.
 */
const OUTCOME_STYLES = {
    SUCCESS: "border-success/30 bg-success/10 text-success",
    FAILURE: "border-destructive/30 bg-destructive/10 text-destructive",
    DENIED: "border-warning/40 bg-warning/15 text-warning-foreground dark:text-warning",
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
            <div className="overflow-x-auto rounded-lg border">
                <Table className="min-w-[980px]">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>Actor</TableHead>
                            <TableHead>Action</TableHead>
                            <TableHead>Target</TableHead>
                            <TableHead>Outcome</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead>Correlation</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {page.items.map((event) => (
                            <TableRow key={event.id} className="align-top">
                                <TableCell className="whitespace-nowrap text-muted-foreground">
                                    {formatTime(event.createdAt)}
                                </TableCell>
                                <TableCell className="max-w-48 font-mono text-xs">
                                    <span className="block truncate">
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
                                            Org: {event.organizationId}
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
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
                {query.cursor ? (
                    <Link
                        href={{
                            pathname: "/audit",
                            query: withoutCursor(query),
                        }}
                        className={buttonVariants({
                            variant: "ghost",
                            size: "sm",
                        })}
                    >
                        Back to newest
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
                        className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                        })}
                    >
                        Older events
                    </Link>
                )}
            </div>
        </>
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
        }).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
}
