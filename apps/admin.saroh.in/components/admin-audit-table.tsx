import Link from "next/link";

import type { AdminAuditPage, AdminAuditQuery } from "@/lib/control-plane";

const OUTCOME_STYLES = {
    SUCCESS:
        "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    FAILURE:
        "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
    DENIED: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
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
            <div className="rounded-lg border border-dashed px-6 py-14 text-center">
                <p className="font-medium">No audit events found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    Try removing a filter or return to the newest events.
                </p>
            </div>
        );
    }

    return (
        <>
            <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                    <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                            <th className="px-4 py-3 font-medium">Time</th>
                            <th className="px-4 py-3 font-medium">Actor</th>
                            <th className="px-4 py-3 font-medium">Action</th>
                            <th className="px-4 py-3 font-medium">Target</th>
                            <th className="px-4 py-3 font-medium">Outcome</th>
                            <th className="px-4 py-3 font-medium">Reason</th>
                            <th className="px-4 py-3 font-medium">
                                Correlation
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {page.items.map((event) => (
                            <tr key={event.id} className="align-top">
                                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                                    {formatTime(event.createdAt)}
                                </td>
                                <td className="max-w-48 px-4 py-3 font-mono text-xs">
                                    <span className="block truncate">
                                        {event.actorUserId}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <p className="font-medium">
                                        {event.action}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {event.permission}
                                    </p>
                                </td>
                                <td className="max-w-56 px-4 py-3">
                                    <p>{event.targetType}</p>
                                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                                        {event.targetId ?? "platform"}
                                    </p>
                                    {event.organizationId && (
                                        <p className="mt-1 truncate text-xs text-muted-foreground">
                                            Org: {event.organizationId}
                                        </p>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <span
                                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLES[event.outcome]}`}
                                    >
                                        {event.outcome.toLowerCase()}
                                    </span>
                                </td>
                                <td className="max-w-72 px-4 py-3 text-muted-foreground">
                                    {event.reason ?? "—"}
                                </td>
                                <td className="max-w-48 px-4 py-3 font-mono text-xs text-muted-foreground">
                                    <span className="block truncate">
                                        {event.correlationId ?? "—"}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
                {query.cursor ? (
                    <Link
                        href={{
                            pathname: "/audit",
                            query: withoutCursor(query),
                        }}
                        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
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
                        className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
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
